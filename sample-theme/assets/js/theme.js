/*
 * Sample theme behaviour (Theme API 1.1, custom_javascript).
 *
 * Everything here is an enhancement: without this file the menus still open and
 * close as native <details> elements and every catalog item stays visible.
 * Shared values live on one global, window.EyivoSampleTheme, because theme
 * files may not import or export.
 */
(function () {
  'use strict';

  var theme = window.EyivoSampleTheme = window.EyivoSampleTheme || {};

  /* Close open header menus on an outside click or Escape. */
  var menus = Array.prototype.slice.call(document.querySelectorAll('details.more-menu, details.sample-navigation'));

  document.addEventListener('click', function (event) {
    menus.forEach(function (menu) {
      if (menu.open && !menu.contains(event.target)) {
        menu.open = false;
      }
    });
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') {
      return;
    }
    menus.forEach(function (menu) {
      if (!menu.open) {
        return;
      }
      menu.open = false;
      var summary = menu.querySelector('summary');
      if (summary) {
        summary.focus();
      }
    });
  });

  /* Give the header a shadow once the page scrolls. */
  var header = document.querySelector('[data-site-header]');
  if (header) {
    var updateHeader = function () {
      header.classList.toggle('is-scrolled', window.scrollY > 12);
    };
    updateHeader();
    window.addEventListener('scroll', updateHeader, { passive: true });
  }

  /* Catalog search: the field is hidden until this script can filter the cards. */
  theme.filterCards = function (grid, query) {
    var words = query.toLowerCase().trim();
    var shown = 0;
    grid.querySelectorAll('[data-filter-card]').forEach(function (card) {
      var text = (card.getAttribute('data-filter-text') || card.textContent).toLowerCase();
      card.hidden = words !== '' && text.indexOf(words) === -1;
      if (!card.hidden) {
        shown++;
      }
    });

    return shown;
  };

  document.querySelectorAll('[data-filter-search]').forEach(function (search) {
    var grid = document.querySelector(search.getAttribute('data-filter-search'));
    var input = search.querySelector('input');
    var empty = search.querySelector('[data-filter-empty]');
    if (!grid || !input) {
      return;
    }
    search.hidden = false;
    input.addEventListener('input', function () {
      var shown = theme.filterCards(grid, input.value);
      if (empty) {
        empty.hidden = shown !== 0;
      }
    });
  });
})();
