/*
 * Adds a "Studio" entry to ODK Central's navbar.
 *
 * Central's interface is a prebuilt Vue application that this project does not
 * fork, so the link is added from the outside: the nginx image injects a tag
 * for this script into Central's index.html at build time, and the script waits
 * for the navbar to render before appending a plain link to it.
 *
 * Everything here is defensive. If a future Central release renames the navbar
 * list, no link is added and Central is otherwise untouched.
 */
(function () {
  'use strict';

  var LINK_ID = 'studio-nav-link';
  var LIST_ID = 'navbar-links';
  var HREF = '/studio/';
  var LABEL = 'Studio';
  var TITLE = 'Questionnaire designer and Stata/SPSS export';

  function insert() {
    if (document.getElementById(LINK_ID) != null) return;

    var list = document.getElementById(LIST_ID);
    if (list == null) return;

    var link = document.createElement('a');
    link.href = HREF;
    link.textContent = LABEL;
    link.title = TITLE;

    var item = document.createElement('li');
    item.id = LINK_ID;
    item.appendChild(link);
    list.appendChild(item);
  }

  function start() {
    insert();

    // The navbar renders after this script runs, and Vue re-renders it on
    // navigation, which can drop the link. Watch for both, coalescing the
    // bursts of mutations the application produces into one check per frame.
    var pending = false;
    var observer = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      window.requestAnimationFrame(function () {
        pending = false;
        insert();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
