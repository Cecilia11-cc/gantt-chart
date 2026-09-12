/* =========================================================================
 * table.js — 可编辑任务表格 + 滚轮式日期选择器（年/月/日三列，滚轮/拖动选择）
 * ========================================================================= */

window.Table = (function () {
  /* ---------------- 滚轮日期选择器 ---------------- */
  var DW = (function () {
    var ITEM_H = 36, VIEW_H = 144;           // 列可视高度，显示约 4 项
    var PAD = (VIEW_H - ITEM_H) / 2;         // 上下留白，使首尾项也能居中
    var el = null, ctx = null;               // ctx: {task, field, y, m, d, minY, maxY}

    function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

    function yearRange() {
      var tasks = AppState.getTasks();
      var y = new Date().getFullYear(), lo = y - 5, hi = y + 10;
      tasks.forEach(function (t) {
        var sy = parseInt(t.start.slice(0, 4), 10) || y;
        var ey = parseInt(t.end.slice(0, 4), 10) || y;
        if (sy < lo) lo = sy - 1;
        if (ey > hi) hi = ey + 1;
      });
      return { lo: lo, hi: hi };
    }

    function col(items, id) {
      var html = '<div class="dw-col" data-col="' + id + '"><div class="dw-list" style="padding-top:' + PAD + 'px;padding-bottom:' + PAD + 'px">';
      items.forEach(function (it) { html += '<div class="dw-item" data-v="' + it.v + '">' + it.label + '</div>'; });
      html += '</div></div>';
      return html;
    }

    function build() {
      if (!el) {
        el = document.createElement('div');
        el.className = 'datewheel';
        document.body.appendChild(el);
      }
      var y = ctx.y, m = ctx.m, d = ctx.d;
      var years = [], months = [], days = [];
      for (var yy = ctx.minY; yy <= ctx.maxY; yy++) years.push({ v: yy, label: yy + '年' });
      for (var mm = 1; mm <= 12; mm++) months.push({ v: mm, label: mm + '月' });
      var dm = daysInMonth(y, m);
      for (var dd = 1; dd <= dm; dd++) days.push({ v: dd, label: dd + '日' });

      el.innerHTML = '<div class="dw-head">' + y + '-' + pad2(m) + '-' + pad2(d) + '</div>'
        + '<div class="dw-body">'
        + col(years, 'year') + col(months, 'month') + col(days, 'day')
        + '</div>'
        + '<div class="dw-actions"><button type="button" class="dw-today">今天</button>'
        + '<button type="button" class="dw-cancel">取消</button>'
        + '<button type="button" class="dw-ok">确定</button></div>';

      el.querySelector('.dw-today').onclick = function () {
        var t = DateUtil.todayStr().split('-').map(Number);
        setDate(t[0], t[1], t[2]);
        build();
      };
      el.querySelector('.dw-cancel').onclick = close;
      el.querySelector('.dw-ok').onclick = commit;

      // 滚动到当前值
      scrollTo('year', y - ctx.minY);
      scrollTo('month', m - 1);
      scrollTo('day', d - 1);

      // 事件：滚轮（原生）+ 拖动 + 点击；scroll 时读取并同步
      el.querySelectorAll('.dw-col').forEach(function (c) {
        c.addEventListener('scroll', debounce(onscroll, 120));
        c.addEventListener('click', function (e) {
          var it = e.target.closest('.dw-item');
          if (!it) return;
          var col = c.getAttribute('data-col');
          var v = parseInt(it.getAttribute('data-v'), 10);
          applyCol(col, v);
          build();
        });
      });
    }

    function pad2(n) { return n < 10 ? '0' + n : '' + n; }

    function scrollTo(col, idx) {
      var c = el.querySelector('.dw-col[data-col="' + col + '"]');
      if (c) c.scrollTop = idx * ITEM_H;
    }

    function applyCol(col, v) {
      if (col === 'year') { ctx.y = v; }
      else if (col === 'month') { ctx.m = v; }
      else { ctx.d = v; }
      var dm = daysInMonth(ctx.y, ctx.m);
      if (ctx.d > dm) ctx.d = dm;
    }

    function onscroll() {
      readAll();
      el.querySelector('.dw-head').textContent = ctx.y + '-' + pad2(ctx.m) + '-' + pad2(ctx.d);
    }

    function readAll() {
      var idx = function (col) {
        var c = el.querySelector('.dw-col[data-col="' + col + '"]');
        return c ? Math.round(c.scrollTop / ITEM_H) : 0;
      };
      var y = ctx.minY + idx('year');
      var m = idx('month') + 1;
      if (y !== ctx.y || m !== ctx.m) {
        // 年/月变化时重建（保证天数正确），保留日尽量
        var oldD = ctx.d;
        ctx.y = y; ctx.m = m;
        var dm = daysInMonth(y, m);
        ctx.d = Math.min(oldD, dm);
        build();
        return;
      }
      ctx.d = idx('day') + 1;
      var dm = daysInMonth(ctx.y, ctx.m);
      if (ctx.d > dm) ctx.d = dm;
    }

    function setDate(y, m, d) { ctx.y = y; ctx.m = m; ctx.d = d; }

    function commit() {
      var val = ctx.y + '-' + pad2(ctx.m) + '-' + pad2(ctx.d);
      var t = ctx.task;
      if (ctx.field === 'start') {
        t.start = val;
        if (t.milestone) t.end = val;
        if (DateUtil.toDay(t.end) < DateUtil.toDay(t.start) && !t.milestone) t.end = val;
      } else {
        t.end = val;
        if (t.milestone) t.start = val;
        if (DateUtil.toDay(t.end) < DateUtil.toDay(t.start) && !t.milestone) t.start = val;
      }
      close();
      AppState.save();
      App.renderAll();
    }

    function open(task, field, anchor) {
      var parts = (field === 'start' ? task.start : task.end).split('-').map(Number);
      var rng = yearRange();
      ctx = { task: task, field: field, y: parts[0], m: parts[1], d: parts[2], minY: rng.lo, maxY: rng.hi };
      build();
      if (anchor) {
        var rect = anchor.getBoundingClientRect();
        el.style.left = Math.min(Math.max(8, rect.left), window.innerWidth - 272) + 'px';
        el.style.top = Math.min(rect.bottom + 4, window.innerHeight - 260) + 'px';
      }
      el.style.display = 'block';
    }

    function close() { el.style.display = 'none'; }

    function debounce(fn, ms) {
      var h = null;
      return function () { if (h) clearTimeout(h); h = setTimeout(fn, ms); };
    }

    return { open: open, close: close, isOpen: function () { return el && el.style.display === 'block'; } };
  })();

  /* ---------------- 表格 ---------------- */
  function render() {
    var tasks = AppState.getTasks();
    var tbody = document.getElementById('task-tbody');
    if (tasks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty">暂无任务 — 点击「+ 添加任务」或「示例数据」开始</td></tr>';
      return;
    }
    var html = tasks.map(function (t) {
      var depChips = (t.deps || []).map(function (d) {
        var dep = AppState.getTask(d);
        return '<span class="chip">' + esc(dep ? dep.name : d) + '<button class="chip-x" data-rmdep="' + d + '" data-task="' + t.id + '">×</button></span>';
      }).join('');
      var candidates = tasks.filter(function (x) { return x.id !== t.id && (t.deps || []).indexOf(x.id) < 0; });

      return '<tr data-id="' + t.id + '">'
        + '<td><input class="f-project" data-task="' + t.id + '" value="' + esc(t.project || '') + '" placeholder="未分组"></td>'
        + '<td><input class="f-name" data-task="' + t.id + '" value="' + esc(t.name) + '"></td>'
        + '<td><button class="datecell f-start" data-task="' + t.id + '" data-field="start"' + (t.milestone ? ' title="里程碑，与结束日期相同"' : '') + '>' + t.start + '</button></td>'
        + '<td><button class="datecell f-end" data-task="' + t.id + '" data-field="end"' + (t.milestone ? ' disabled' : '') + '>' + t.end + '</button></td>'
        + '<td class="cell-progress"><input class="f-progress" type="number" min="0" max="100" data-task="' + t.id + '" value="' + (t.progress || 0) + '"><span>%</span></td>'
        + '<td class="cell-deps"><div class="chips">' + depChips + '</div>'
        + (candidates.length ? '<select class="f-depadd" data-task="' + t.id + '"><option value="">＋前置</option>' + candidates.map(function (x) { return '<option value="' + x.id + '">' + esc(x.name) + '</option>'; }).join('') + '</select>' : '')
        + '</td>'
        + '<td><input class="f-resource" data-task="' + t.id + '" value="' + esc(t.resource || '') + '" placeholder="—"></td>'
        + '<td class="cell-milestone"><label><input class="f-milestone" type="checkbox" data-task="' + t.id + '"' + (t.milestone ? ' checked' : '') + '>里程碑</label></td>'
        + '<td class="cell-del"><button class="f-del" data-task="' + t.id + '" title="删除任务">✕</button></td>'
        + '</tr>';
    }).join('');
    tbody.innerHTML = html;
    bind();
  }

  function bind() {
    var tbody = document.getElementById('task-tbody');

    function taskOf(el) { return AppState.getTask(el.getAttribute('data-task')); }

    // 文本框
    tbody.querySelectorAll('input.f-name, input.f-project, input.f-resource').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var t = taskOf(inp); if (!t) return;
        if (inp.classList.contains('f-name')) t.name = inp.value;
        else if (inp.classList.contains('f-project')) t.project = inp.value;
        else t.resource = inp.value;
        AppState.save(); App.renderChart();
      });
    });

    // 进度
    tbody.querySelectorAll('input.f-progress').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var t = taskOf(inp); if (!t) return;
        t.progress = Math.max(0, Math.min(100, parseInt(inp.value, 10) || 0));
        AppState.save(); App.renderChart();
      });
    });

    // 日期 → 滚轮选择
    tbody.querySelectorAll('button.datecell').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var t = taskOf(btn); if (!t || btn.disabled) return;
        DW.open(t, btn.getAttribute('data-field'), btn);
      });
    });

    // 里程碑切换
    tbody.querySelectorAll('input.f-milestone').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var t = taskOf(cb); if (!t) return;
        t.milestone = cb.checked;
        if (t.milestone) t.end = t.start;
        AppState.save(); App.renderAll();
      });
    });

    // 删除任务
    tbody.querySelectorAll('button.f-del').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = taskOf(b); if (!t) return;
        if (confirm('删除任务「' + t.name + '」？')) {
          AppState.removeTask(t.id);
          AppState.save(); App.renderAll();
        }
      });
    });

    // 删除依赖
    tbody.querySelectorAll('button.chip-x').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = AppState.getTask(b.getAttribute('data-task'));
        var dep = b.getAttribute('data-rmdep');
        if (t && t.deps) { t.deps = t.deps.filter(function (d) { return d !== dep; }); AppState.save(); App.renderAll(); }
      });
    });

    // 添加依赖
    tbody.querySelectorAll('select.f-depadd').forEach(function (s) {
      s.addEventListener('change', function () {
        var t = taskOf(s); if (!t || !s.value) { s.value = ''; return; }
        t.deps = (t.deps || []).concat(s.value);
        s.value = '';
        AppState.save(); App.renderAll();
      });
    });
  }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /* 点击外部关闭滚轮 */
  document.addEventListener('click', function (e) {
    if (DW.isOpen() && !e.target.closest('.datewheel') && !e.target.closest('.datecell')) DW.close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') DW.close();
  });

  return { render: render };
})();
