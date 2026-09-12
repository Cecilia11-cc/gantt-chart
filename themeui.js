/* =========================================================================
 * themeui.js — 色系选择面板：悬停实时预览、点击锁定、自定义色系编辑器
 * ========================================================================= */

window.ThemeUI = (function () {
  var el = null, btn = null;

  function init() {
    btn = document.getElementById('btn-theme-picker');
    if (!btn) return;
    el = document.createElement('div');
    el.className = 'theme-popover';
    document.body.appendChild(el);

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (isOpen()) close(); else open();
    });

    // 移出色卡面板 → 撤销预览；点击外部 / Esc → 关闭
    el.addEventListener('mouseleave', function () {
      if (isOpen()) { Themes.clearPreview(); App.renderChart(); }
    });
    document.addEventListener('click', function (e) {
      if (isOpen() && !e.target.closest('.theme-popover') && !e.target.closest('#btn-theme-picker')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) close();
    });

    updateButton();
  }

  function isOpen() { return el && el.style.display === 'block'; }

  function open() { showGrid(); position(); el.style.display = 'block'; }
  function close() {
    el.style.display = 'none';
    Themes.clearPreview();
    App.renderChart();
  }

  function position() {
    var r = btn.getBoundingClientRect();
    el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 376)) + 'px';
    el.style.top = Math.min(r.bottom + 8, window.innerHeight - 460) + 'px';
  }

  function updateButton() {
    var t = Themes.get(Themes.currentId());
    if (!t) return;
    var dots = t.colors.slice(0, 4).map(function (c) { return '<span class="btn-dot" style="background:' + c + '"></span>'; }).join('');
    btn.innerHTML = '<span class="btn-emoji">🎨</span><span class="btn-dots">' + dots + '</span><span class="btn-name">' + esc(t.name) + '</span>';
  }

  function dotsHtml(colors) {
    return '<span class="theme-dots">' + colors.map(function (c) { return '<span class="theme-dot" style="background:' + c + '"></span>'; }).join('') + '</span>';
  }

  /* ---------------- 色卡网格 ---------------- */
  function showGrid() {
    var cur = Themes.currentId();
    var list = Themes.all();
    var html = '<div class="theme-title">选择色系<span class="theme-sub">悬停预览 · 点击应用</span></div><div class="theme-grid">';
    list.forEach(function (t) {
      html += '<div class="theme-card' + (t.id === cur ? ' active' : '') + '" data-id="' + t.id + '">'
        + dotsHtml(t.colors)
        + '<div class="theme-name">' + esc(t.name)
        + (t.custom ? '<button class="theme-del" data-id="' + t.id + '" title="删除">✕</button>' : '')
        + '</div></div>';
    });
    html += '</div><button class="theme-add" id="theme-add">＋ 自定义色系</button>';
    el.innerHTML = html;

    el.querySelectorAll('.theme-card').forEach(function (card) {
      card.addEventListener('mouseenter', function () {
        Themes.preview(card.getAttribute('data-id'));
        App.renderChart();
      });
      card.addEventListener('click', function () {
        Themes.setCurrent(card.getAttribute('data-id'));
        Themes.clearPreview();
        App.renderChart();
        updateButton();
        close();
      });
    });
    el.querySelectorAll('.theme-del').forEach(function (d) {
      d.addEventListener('click', function (e) {
        e.stopPropagation();
        if (confirm('删除该自定义色系？')) { Themes.removeCustom(d.getAttribute('data-id')); showGrid(); }
      });
    });
    var add = el.querySelector('#theme-add');
    if (add) add.addEventListener('click', showBuilder);
  }

  /* ---------------- 自定义色系编辑器 ---------------- */
  function showBuilder() {
    var base = Themes.get(Themes.currentId()).colors.slice();
    var html = '<div class="theme-title">自定义色系</div>'
      + '<input class="theme-name-input" id="tb-name" placeholder="给这套配色取个名字，如「春日」" maxlength="12">'
      + '<div class="theme-builder-colors">';
    for (var i = 0; i < 8; i++) {
      html += '<label class="tb-swatch"><input type="color" value="' + base[i] + '" data-i="' + i + '"><span>' + base[i].toUpperCase() + '</span></label>';
    }
    html += '</div>'
      + '<div class="theme-builder-preview">' + dotsHtml(base) + '</div>'
      + '<div class="tb-actions"><button id="tb-cancel">取消</button><button id="tb-save">保存并应用</button></div>';
    el.innerHTML = html;

    var previewDots = el.querySelector('.theme-builder-preview');

    el.querySelectorAll('input[type=color]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        inp.nextElementSibling.textContent = inp.value.toUpperCase();
        var colors = readColors();
        previewDots.innerHTML = dotsHtml(colors);
        Themes.previewColors(colors);
        App.renderChart();
      });
    });

    el.querySelector('#tb-cancel').addEventListener('click', function () {
      Themes.clearPreview(); App.renderChart(); showGrid();
    });
    el.querySelector('#tb-save').addEventListener('click', function () {
      var name = el.querySelector('#tb-name').value.trim();
      if (!name) { el.querySelector('#tb-name').focus(); return; }
      var t = Themes.addCustom(name, readColors());
      Themes.setCurrent(t.id);
      Themes.clearPreview();
      App.renderChart();
      updateButton();
      showGrid();
    });
  }

  function readColors() {
    var arr = [];
    el.querySelectorAll('input[type=color]').forEach(function (inp) { arr.push(inp.value); });
    return arr;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  return { init: init, isOpen: isOpen };
})();
