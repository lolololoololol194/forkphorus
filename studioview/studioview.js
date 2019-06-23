(function(scope) {
  'use strict';

  /**
   * Determines if an element is visible, accounting for parents and their bounding rects.
   */
  function isElementVisible(el) {
    // see https://stackoverflow.com/a/21627295
    var rect = el.getBoundingClientRect();
    var top = rect.top;
    var height = rect.height;
    var el = el.parentNode;

    if (rect.bottom < 0) return false
    if (top > document.documentElement.clientHeight) return false
    do {
      rect = el.getBoundingClientRect()
      if (top <= rect.bottom === false) return false
      if ((top + height) <= rect.top) return false
      el = el.parentNode
    } while (el != document.body)
    return true
  }

  function shuffleList(list) {
    // https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle#The_modern_algorithm
    for (var i = list.length - 1; i > 0; i--) {
      var random = Math.floor(Math.random() * (i + 1));
      var tmp = list[i];
      list[i] = list[random];
      list[random] = tmp;
    }
  }

  /**
   * @class
   */
  var StudioView = function(studioId) {
    this.studioId = studioId;
    this.page = 1;
    this.ended = false;
    this.loadingPage = false;
    this.shuffleProjects = false;
    this.unusedTombstones = [];

    this.root = document.createElement('div');
    this.root.className = 'studioview-root';
    this.projectList = document.createElement('div');
    this.projectList.className = 'studioview-list';
    this.projectList.addEventListener('scroll', this.handleScroll.bind(this), {passive: true});
    this.root.appendChild(this.projectList);
    this.setTheme('light');

    if ('IntersectionObserver' in window) {
      this.intersectionObserver = new IntersectionObserver(this.handleIntersection.bind(this), {
        root: this.projectList,
        // load images roughly 100px before they become visible to make them load quicker
        rootMargin: '100px 0px 100px 0px',
      });
    } else {
      this.intersectionObserver = null;
    }
  };

  /**
   * Add a project to the view.
   * An unused tombstone element may be used, or it may be created.
   */
  StudioView.prototype.addProject = function(details) {
    var el;
    if (this.unusedTombstones.length) {
      el = this.unusedTombstones.shift();
    } else {
      el = this.createTombstone();
      this.projectList.appendChild(el);
    }
    this.tombstoneToProject(el, details.id, details.title, details.author);
  };

  /**
   * Create an <img> element that will load only when it becomes visible.
   */
  StudioView.prototype.createLazyImage = function(src) {
    var el = document.createElement('img');
    if (this.intersectionObserver) {
      this.intersectionObserver.observe(el);
      el.className = 'studioview-lazy';
      el.dataset.src = src;
    } else {
      // then we just won't lazy load it
      el.src = src;
    }
    return el;
  };

  /**
   * Create a tombstone or placeholder element.
   */
  StudioView.prototype.createTombstone = function() {
    var el = document.createElement('a');
    el.className = 'studioview-project studioview-tombstone';

    var thumbnail = document.createElement('div');
    thumbnail.className = 'studioview-thumbnail';

    var title = document.createElement('div');
    title.className = 'studioview-title';

    var author = document.createElement('div');
    author.className = 'studioview-author';

    el.thumbnailEl = thumbnail;
    el.titleEl = title;
    el.authorEl = author;

    el.appendChild(thumbnail);
    el.appendChild(title);
    el.appendChild(author);

    return el;
  };

  /**
   * Convert a tombstone element made by createTombstone to a project element.
   */
  StudioView.prototype.tombstoneToProject = function(el, id, title, author) {
    el.className = 'studioview-project studioview-loaded';
    el.dataset.id = id;
    el.title = title + ' by ' + author;
    el.href = StudioView.PROJECT_PAGE.replace('$id', id);

    var thumbnailSrc = StudioView.THUMBNAIL_SRC.replace('$id', id);
    var thumbnailImg = this.createLazyImage(thumbnailSrc);
    el.thumbnailEl.appendChild(thumbnailImg);

    el.titleEl.innerText = title;
    el.authorEl.innerText = 'by ' + author;

    el.addEventListener('click', this.handleClick.bind(this), true);
    el.addEventListener('keydown', this.handleKeyDown.bind(this), true);

    return el;
  };

  /**
   * Adds an error message to the list.
   */
  StudioView.prototype.addErrorElement = function() {
    var el = document.createElement('div');
    el.innerText = 'There was an error loading the next page of projects.';
    el.className = 'studioview-error';
    this.projectList.appendChild(el);
  };

  // Called when the project list is scrolled
  StudioView.prototype.handleScroll = function(e) {
    if (this.canLoadNext() && isElementVisible(this.projectList.lastChild)) {
      this.loadNextPage();
    }
  };

  // Click a project element or a child of a project element
  StudioView.prototype.clickProject = function(el) {
    while (!el.classList.contains('studioview-project')) {
      el = el.parentNode;
    }
    var id = el.dataset.id;
    this.onselect(id);
  }

  // Called when click is fired on a project element
  StudioView.prototype.handleClick = function(e) {
    e.preventDefault();
    this.clickProject(e.target);
  };

  // Called when keydown is fired on a project element
  StudioView.prototype.handleKeyDown = function(e) {
    if (e.keyCode === 13) {
      // treat enter (13) as click
      e.preventDefault();
      this.clickProject(e.target);
    }
  };

  // Called by the IntersectionObserver when it sees an intersection
  StudioView.prototype.handleIntersection = function(entries, observer) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        var target = entry.target;
        target.src = target.dataset.src;
        target.dataset.src = '';
        target.className = '';
        observer.unobserve(target);
      }
    });
  };

  /**
   * Determines whether it is safe to attempt to load the next page.
   */
  StudioView.prototype.canLoadNext = function() {
    return !this.loadingPage && !this.ended;
  };

  /**
   * Remove all unused tombstone elements.
   */
  StudioView.prototype.cleanupTombstones = function() {
    while (this.unusedTombstones.length) {
      var el = this.unusedTombstones.pop();
      this.projectList.removeChild(el);
    }
  };

  /**
   * Add tombstone placeholder elements.
   */
  StudioView.prototype.addTombstones = function() {
    for (var i = 0; i < StudioView.TOMBSTONE_COUNT; i++) {
      var el = this.createTombstone();
      this.unusedTombstones.push(el);
      this.projectList.appendChild(el);
    }
  };

  /**
   * Begins loading the next page.
   */
  StudioView.prototype.loadNextPage = function() {
    if (this.loadingPage) {
      throw new Error('Already loading the next page');
    }
    if (this.ended) {
      throw new Error('There are no more pages to load');
    }

    this.addTombstones();
    this.root.setAttribute('loading', '');
    this.loadingPage = true;

    var xhr = new XMLHttpRequest();
    xhr.onload = function() {
      var doc = xhr.response;

      var projects = [];
      var projectElements = doc.querySelectorAll('.project');
      /*
      Each project element should be:
      <li class="project thumb item" data-id="12345">
        <a href="/projects/12345/">
          <img class="lazy image" data-original="//cdn2.scratch.mit.edu/get_image/project/12345_144x108.png" width="144" height="108" />
        </a>
        <span class="title">
          <a href="/projects/12345/">Title</a>
        </span>
        <span class="owner" >
          by <a href="/users/Author/">Author</a>
        </span>
      </li>
      */
      for (var i = 0; i < projectElements.length; i++) {
        var project = projectElements[i];
        var id = project.getAttribute('data-id');
        var title = project.querySelector('.title').innerText.trim();
        var author = project.querySelector('.owner a').innerText.trim();
        projects.push({
          id: id,
          title: title,
          author: author,
        });
      }
      if (this.shuffleProjects) {
        shuffleList(projects);
      }
      for (var i = 0; i < projects.length; i++) {
        this.addProject(projects[i]);
      }
      this.cleanupTombstones();

      // All pages except the last have a next page button.
      if (!doc.querySelector('.next-page')) {
        this.ended = true;
        this.onend();
      }

      this.page++;
      this.loadingPage = false;
      this.root.removeAttribute('loading');

      this.onpageload();
    }.bind(this);

    xhr.onerror = function() {
      this.root.setAttribute('error', '');
      this.cleanupTombstones();
      this.addErrorElement();
      this.ended = true;
    }.bind(this);

    var url = StudioView.STUDIO_API
      .replace('$id', this.studioId)
      .replace('$page', this.page);
    xhr.open('GET', url);
    xhr.responseType = 'document';
    xhr.send();
  };

  StudioView.prototype.setTheme = function(theme) {
    this.root.setAttribute('theme', theme);
  };

  StudioView.prototype.onselect = function(id) {};
  StudioView.prototype.onpageload = function() {};
  StudioView.prototype.onend = function() {};

  // This can be any URL that is a proxy for https://scratch.mit.edu/site-api/projects/in/5235006/1/
  // Understandably scratch does not set CORS headers on this URL, but a proxy can set it manually.
  // I setup a proxy @ scratch.garbomuffin.com that does this.
  // $id will be replaced with the studio ID, and $page with the page.
  StudioView.STUDIO_API = 'https://scratch.garbomuffin.com/api/site-api/projects/in/$id/$page/';

  // The URL to download thumbnails from.
  // $id is replaced with the project's ID
  StudioView.THUMBNAIL_SRC = 'https://cdn2.scratch.mit.edu/get_image/project/$id_144x108.png';

  // The URL for a project's page.
  // $id is replaced with the project ID.
  StudioView.PROJECT_PAGE = 'https://scratch.mit.edu/projects/$id/';

  // The amount of "placeholders" or "tombstones" to insert before the next page loads.
  StudioView.TOMBSTONE_COUNT = 9;

  scope.StudioView = StudioView;
}(window));