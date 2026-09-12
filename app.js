/* =========================================================================
 * app.js — 主控制器：初始化、工具栏、主题、缩放、导入导出接线
 * ========================================================================= */

window.App = (function () {
  function renderChart() { Gantt.render(); }
  function refreshTable() { Table.render(); }
  function renderAll() { Gantt.render(); Table.render(); }

  function addTask() {
    var today = DateUtil.todayStr();
    var t = { id: AppState.uid(), name: '新任务', project: '', start: today, end: DateUtil.addDays(today, 3),
              progress: 0, deps: [], milestone: false, resource: '', color: null };
    AppState.addTask(t);
    AppState.save();
    renderAll();
    var row = document.querySelector('#task-tbody tr[data-id="' + t.id + '"]');
    if (row) { var nameInput = row.querySelector('.f-name'); if (nameInput) { nameInput.focus(); nameInput.select(); } }
  }

  function loadSample() {
    AppState.setTasks(AppState.sample());
    AppState.save();
    renderAll();
  }

  function toggleTheme() {
    var next = AppState.theme() === 'dark' ? 'light' : 'dark';
    AppState.setTheme(next);
    document.body.setAttribute('data-theme', next);
    var btn = document.getElementById('btn-theme');
    if (btn) btn.textContent = next === 'dark' ? '浅色' : '深色';
    renderAll();
  }

  function setZoom(z) {
    Gantt.setZoom(z);
    document.querySelectorAll('[data-zoom]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-zoom') === z);
    });
  }

  function toggleLink() {
    var on = !Gantt.isLinkMode();
    Gantt.setLinkMode(on);
    var btn = document.getElementById('btn-link');
    btn.classList.toggle('active', on);
    btn.textContent = on ? '退出连线' : '连线模式';
    if (on) alert('连线模式：先点击一个「前置」任务，再点击它的「后继」任务，即建立依赖（A→B 表示 B 依赖 A）。');
  }

  /* 文件导入 */
  var pendingKind = 'csv';
  function pickFile(kind) {
    pendingKind = kind;
    var input = document.getElementById('file-input');
    input.accept = kind === 'excel' ? '.xlsx,.xls' : (kind === 'json' ? '.json' : '.csv');
    input.value = '';
    input.click();
  }

  function bindToolbar() {
    function on(id, fn) { var el = document.getElementById(id); if (el) el.addEventListener('click', fn); }

    on('btn-add-task', addTask);
    on('btn-sample', loadSample);
    on('btn-import-csv', function () { pickFile('csv'); });
    on('btn-import-excel', function () { pickFile('excel'); });
    on('btn-import-json', function () { pickFile('json'); });
    on('btn-export-json', ImportExport.exportJSON);
    on('btn-export-png', ImportExport.exportPNG);
    on('btn-print', function () { window.print(); });
    on('btn-theme', toggleTheme);
    on('btn-link', toggleLink);

    document.querySelectorAll('[data-zoom]').forEach(function (b) {
      b.addEventListener('click', function () { setZoom(b.getAttribute('data-zoom')); });
    });

    document.getElementById('file-input').addEventListener('change', function (e) {
      var f = e.target.files[0];
      if (f) ImportExport.handleFile(f, pendingKind);
    });

    // 左侧任务列与图表纵向滚动同步
    var right = document.getElementById('gantt-right');
    var left = document.getElementById('gantt-left');
    if (right && left) {
      right.addEventListener('scroll', function () { left.scrollTop = right.scrollTop; });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && Gantt.isLinkMode()) { Gantt.setLinkMode(false); var b = document.getElementById('btn-link'); b.classList.remove('active'); b.textContent = '连线模式'; }
    });
  }

  function setupIntro() {
    var intro = document.getElementById('intro');
    var start = document.getElementById('intro-start');
    var noshow = document.getElementById('intro-noshow');
    if (!intro || !start) return;
    if (localStorage.getItem('gantt-intro-hidden') === '1') { intro.classList.add('gone'); return; }
    start.addEventListener('click', function () {
      if (noshow && noshow.checked) { try { localStorage.setItem('gantt-intro-hidden', '1'); } catch (e) {} }
      intro.classList.add('hide');
      setTimeout(function () { intro.classList.add('gone'); }, 340);
    });
  }

  function init() {
    document.body.setAttribute('data-theme', AppState.theme());
    if (!AppState.load()) { AppState.setTasks(AppState.sample()); AppState.save(); }
    Gantt.bind();
    bindToolbar();
    ThemeUI.init();
    renderAll();
    setupIntro();
  }

  return { init: init, renderChart: renderChart, refreshTable: refreshTable, renderAll: renderAll };
})();

document.addEventListener('DOMContentLoaded', App.init);
