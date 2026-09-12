/* =========================================================================
 * gantt.js — SVG 甘特图渲染 + 交互（拖拽移动/改期、缩放、依赖连线、提示）
 * ========================================================================= */

window.Gantt = (function () {
  var DAY = 86400000;

  var ROW_H = 30, PROJECT_H = 34, HEADER_H = 52, BAR_H = 18;
  var ZOOM_W = { day: 26, week: 10, month: 4 };

  var zoom = 'day';
  var layout = null;
  var linkMode = false;
  var linkSource = null;
  var drag = null; // {handle, id, startX, s0, e0, dayWidth}
  var _conf = {};   // 资源冲突任务 id 集合

  /* ---------------- 日期/刻度工具 ---------------- */
  function startOfWeek(day) { return day - ((new Date(day * DAY).getUTCDay() + 6) % 7); }
  function startOfMonth(day) {
    var d = new Date(day * DAY);
    return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / DAY);
  }
  function endOfMonth(day) {
    var d = new Date(day * DAY);
    return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0) / DAY);
  }
  function addMonths(day, n) {
    var d = new Date(day * DAY);
    return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1) / DAY);
  }
  function monthLabel(day) {
    var d = new Date(day * DAY);
    return d.getUTCFullYear() + '年' + (d.getUTCMonth() + 1) + '月';
  }
  function yearLabel(day) { return new Date(day * DAY).getUTCFullYear() + '年'; }
  function shortDate(day) {
    var d = new Date(day * DAY);
    return (d.getUTCMonth() + 1) + '/' + d.getUTCDate();
  }
  function textColorFor(hex) {
    var c = hex.replace('#', '');
    var r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
    var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? '#0b0b0b' : '#ffffff';
  }

  function alignStart(day) {
    if (zoom === 'month') return startOfMonth(day);
    return startOfWeek(day);
  }

  /* ---------------- 布局 ---------------- */
  function computeLayout(tasks) {
    var zw = ZOOM_W[zoom];
    var groups = [], map = {};
    tasks.forEach(function (t) {
      var p = t.project || '未分组';
      if (!map[p]) { map[p] = []; groups.push(p); }
      map[p].push(t);
    });

    var minD = Infinity, maxD = -Infinity;
    tasks.forEach(function (t) {
      var s = DateUtil.toDay(t.start), e = DateUtil.toDay(t.end);
      if (s < minD) minD = s; if (e > maxD) maxD = e;
    });
    if (!isFinite(minD)) { minD = DateUtil.toDay(DateUtil.todayStr()); maxD = minD; }
    var pad = zoom === 'month' ? 40 : (zoom === 'week' ? 20 : 10);
    var viewStart = alignStart(minD - pad);
    var viewEnd = maxD + pad;

    var y = HEADER_H, rows = [];
    groups.forEach(function (p) {
      rows.push({ type: 'project', project: p, tasks: map[p], y: y, h: PROJECT_H });
      y += PROJECT_H;
      map[p].forEach(function (t) { rows.push({ type: 'task', task: t, y: y, h: ROW_H }); y += ROW_H; });
    });
    var totalH = y + 28;
    var chartW = (viewEnd - viewStart + 1) * zw;

    layout = { zw: zw, viewStart: viewStart, viewEnd: viewEnd, chartW: chartW, totalH: totalH, rows: rows, groups: groups };
    return layout;
  }

  function dayToX(day) { return (day - layout.viewStart) * layout.zw; }

  /* 底部刻度（日/周/月列） */
  function buildTicks() {
    var s = layout.viewStart, e = layout.viewEnd, zw = layout.zw, out = [];
    if (zoom === 'day') {
      for (var d = s; d <= e; d++) out.push({ day: d, label: String(new Date(d * DAY).getUTCDate()), x: dayToX(d), w: zw });
    } else if (zoom === 'week') {
      var d = startOfWeek(s);
      while (d <= e) { var we = Math.min(d + 6, e); out.push({ day: d, label: shortDate(d), x: dayToX(d), w: (we - d + 1) * zw }); d += 7; }
    } else {
      var m = startOfMonth(s);
      while (m <= e) { var me = Math.min(endOfMonth(m), e); out.push({ day: m, label: monthLabel(m), x: dayToX(m), w: (me - m + 1) * zw }); m = addMonths(m, 1); }
    }
    return out;
  }

  /* 顶层刻度（按上层单位合并） */
  function buildTop(ticks) {
    var tops = [], cur = null;
    ticks.forEach(function (tk) {
      var label = zoom === 'month' ? yearLabel(tk.day) : monthLabel(tk.day);
      if (cur && cur.label === label) { cur.w += tk.w; }
      else { cur = { label: label, x: tk.x, w: tk.w }; tops.push(cur); }
    });
    return tops;
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    var tasks = AppState.getTasks();
    var L = computeLayout(tasks);
    var c = AppState.chrome();
    var crit = Scheduler.criticalIds(tasks);
    _conf = Scheduler.resourceConflicts(tasks);
    var ticks = buildTicks();
    var tops = buildTop(ticks);

    var P = [];
    P.push('<rect x="0" y="0" width="' + L.chartW + '" height="' + L.totalH + '" fill="' + c.surface + '"/>');

    /* 表头背景 */
    P.push('<rect x="0" y="0" width="' + L.chartW + '" height="' + HEADER_H + '" fill="' + c.surface + '"/>');

    /* 周末底纹（日视图） */
    if (zoom === 'day') {
      for (var wd = L.viewStart; wd <= L.viewEnd; wd++) {
        if (DateUtil.isWeekend(wd)) {
          P.push('<rect x="' + dayToX(wd) + '" y="' + HEADER_H + '" width="' + L.zw + '" height="' + (L.totalH - HEADER_H) + '" fill="' + (c.ink2 === '#c3c2b7' ? '#f4f3ee' : '#242422') + '"/>');
        }
      }
    }

    /* 竖向网格线 + 表头标签 */
    ticks.forEach(function (tk) {
      P.push('<line x1="' + tk.x + '" y1="' + HEADER_H + '" x2="' + tk.x + '" y2="' + L.totalH + '" stroke="' + c.grid + '" stroke-width="1"/>');
      P.push('<text x="' + (tk.x + tk.w / 2) + '" y="' + (HEADER_H - 8) + '" text-anchor="middle" font-size="11" fill="' + c.ink2 + '" font-family="system-ui, Segoe UI, sans-serif">' + tk.label + '</text>');
    });
    /* 顶层标签 */
    tops.forEach(function (tp) {
      P.push('<text x="' + (tp.x + tp.w / 2) + '" y="' + 16 + '" text-anchor="middle" font-size="12" font-weight="600" fill="' + c.ink + '" font-family="system-ui, Segoe UI, sans-serif">' + tp.label + '</text>');
      P.push('<line x1="' + tp.x + '" y1="0" x2="' + tp.x + '" y2="' + HEADER_H + '" stroke="' + c.baseline + '" stroke-width="1"/>');
    });

    /* 横向网格线（行分隔） */
    L.rows.forEach(function (r) {
      P.push('<line x1="0" y1="' + (r.y + r.h) + '" x2="' + L.chartW + '" y2="' + (r.y + r.h) + '" stroke="' + c.grid + '" stroke-width="1"/>');
    });

    /* 今天线 */
    var today = DateUtil.toDay(DateUtil.todayStr());
    if (today >= L.viewStart && today <= L.viewEnd) {
      var tx = dayToX(today) + L.zw / 2;
      P.push('<line x1="' + tx + '" y1="0" x2="' + tx + '" y2="' + L.totalH + '" stroke="' + AppState.criticalColor() + '" stroke-width="1.5" stroke-dasharray="4 3"/>');
    }

    /* 依赖箭头（画在条形之下） */
    P.push('<defs>'
      + '<marker id="arr-gray" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="' + c.muted + '"/></marker>'
      + '<marker id="arr-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="' + AppState.criticalColor() + '"/></marker>'
      + '</defs>');
    tasks.forEach(function (t) {
      (t.deps || []).forEach(function (depId) {
        var dep = AppState.getTask(depId);
        if (!dep) return;
        var a = barAnchor(dep), b = barAnchor(t);
        if (!a || !b) return;
        var isCrit = crit[t.id] && crit[depId];
        var color = isCrit ? AppState.criticalColor() : c.muted;
        var marker = isCrit ? 'arr-red' : 'arr-gray';
        var dx = Math.max(18, Math.min(40, Math.abs(b.x - a.x) / 2));
        P.push('<path d="M' + a.x + ' ' + a.y + ' C ' + (a.x + dx) + ' ' + a.y + ', ' + (b.x - dx) + ' ' + b.y + ', ' + b.x + ' ' + b.y + '" fill="none" stroke="' + color + '" stroke-width="1.5" marker-end="url(#' + marker + ')"/>');
      });
    });

    /* 任务条形 */
    L.rows.forEach(function (r) {
      if (r.type !== 'task') return;
      var t = r.task;
      var s = DateUtil.toDay(t.start), e = DateUtil.toDay(t.end);
      var dur = taskDuration(t);
      var color = t.color || AppState.projectColor(t.project);
      var isCrit = !!crit[t.id];
      var isSource = linkSource === t.id;

      if (t.milestone) {
        var cx = dayToX(s) + L.zw / 2, cy = r.y + ROW_H / 2;
        var stroke = isCrit ? AppState.criticalColor() : (c.ink === '#ffffff' ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.25)');
        P.push('<g data-id="' + t.id + '" data-handle="body" style="cursor:pointer">'
          + '<polygon points="' + cx + ',' + (cy - 7) + ' ' + (cx + 7) + ',' + cy + ' ' + cx + ',' + (cy + 7) + ' ' + (cx - 7) + ',' + cy + '" fill="' + color + '" stroke="' + stroke + '" stroke-width="' + (isCrit ? 2 : 1) + '"/>'
          + (isSource ? '<polygon points="' + cx + ',' + (cy - 10) + ' ' + (cx + 10) + ',' + cy + ' ' + cx + ',' + (cy + 10) + ' ' + (cx - 10) + ',' + cy + '" fill="none" stroke="' + c.ink + '" stroke-width="1" stroke-dasharray="3 2"/>' : '')
          + labelText(t.name, cx + 12, r.y + ROW_H / 2 + 4, c.ink2)
          + '</g>');
      } else {
        var bx = dayToX(s), bw = dur * L.zw;
        var by = r.y + (ROW_H - BAR_H) / 2;
        var rx = 3;
        P.push('<g data-id="' + t.id + '">');
        P.push('<rect data-handle="body" x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + BAR_H + '" rx="' + rx + '" fill="' + color + '" stroke="' + (isCrit ? AppState.criticalColor() : 'rgba(0,0,0,0)') + '" stroke-width="' + (isCrit ? 2 : 0) + '" style="cursor:move"/>');
        if (t.progress > 0) {
          var pw = bw * Math.min(100, t.progress) / 100;
          P.push('<rect x="' + bx + '" y="' + by + '" width="' + pw + '" height="' + BAR_H + '" rx="' + rx + '" fill="' + (c.ink === '#ffffff' ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.22)') + '"/>');
        }
        if (isSource) {
          P.push('<rect x="' + (bx - 2) + '" y="' + (by - 2) + '" width="' + (bw + 4) + '" height="' + (BAR_H + 4) + '" rx="' + (rx + 2) + '" fill="none" stroke="' + c.ink + '" stroke-width="1" stroke-dasharray="4 2"/>');
        }
        /* 拖拽手柄 */
        P.push('<rect data-handle="left" x="' + (bx - 3) + '" y="' + by + '" width="6" height="' + BAR_H + '" fill="transparent" style="cursor:ew-resize"/>');
        P.push('<rect data-handle="right" x="' + (bx + bw - 3) + '" y="' + by + '" width="6" height="' + BAR_H + '" fill="transparent" style="cursor:ew-resize"/>');
        /* 标签 */
        var needWidth = t.name.length * 6.5 + 10;
        if (bw > needWidth + 12) {
          P.push('<text x="' + (bx + 6) + '" y="' + (by + BAR_H / 2 + 4) + '" font-size="11" fill="' + textColorFor(color) + '" font-family="system-ui, Segoe UI, sans-serif">' + esc(t.name) + '</text>');
        } else {
          P.push('<text x="' + (bx + bw + 6) + '" y="' + (by + BAR_H / 2 + 4) + '" font-size="11" fill="' + c.ink2 + '" font-family="system-ui, Segoe UI, sans-serif">' + esc(t.name) + '</text>');
        }
        P.push('</g>');
      }
    });

    var svgEl = document.getElementById('gantt-svg');
    svgEl.setAttribute('width', L.chartW);
    svgEl.setAttribute('height', L.totalH);
    svgEl.setAttribute('viewBox', '0 0 ' + L.chartW + ' ' + L.totalH);
    svgEl.innerHTML = P.join('');
    renderLeft(tasks, crit);
  }

  function barAnchor(t) {
    var s = DateUtil.toDay(t.start);
    if (t.milestone) {
      return { x: dayToX(s) + layout.zw / 2 + 7, y: rowYOf(t.id) };
    }
    var bw = taskDuration(t) * layout.zw;
    return { x: dayToX(s) + bw, y: rowYOf(t.id) };
  }

  function rowYOf(id) {
    for (var i = 0; i < layout.rows.length; i++) {
      var r = layout.rows[i];
      if (r.type === 'task' && r.task.id === id) return r.y + ROW_H / 2;
    }
    return HEADER_H;
  }

  function labelText(text, x, y, fill) {
    return '<text x="' + x + '" y="' + y + '" font-size="11" fill="' + fill + '" font-family="system-ui, Segoe UI, sans-serif">' + esc(text) + '</text>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------------- 左侧任务列 ---------------- */
  function renderLeft(tasks, crit) {
    var L = layout, c = AppState.chrome();
    var html = ['<div style="height:' + HEADER_H + 'px"></div>'];
    L.rows.forEach(function (r) {
      if (r.type === 'project') {
        var total = 0;
        r.tasks.forEach(function (t) { total += t.progress || 0; });
        var avg = r.tasks.length ? Math.round(total / r.tasks.length) : 0;
        html.push('<div class="lp-project" style="height:' + r.h + 'px">'
          + '<span class="lp-dot" style="background:' + AppState.projectColor(r.project) + '"></span>'
          + '<span class="lp-name">' + esc(r.project) + '</span>'
          + '<span class="lp-meta">' + r.tasks.length + ' 任务 · ' + avg + '%</span></div>');
      } else {
        var t = r.task;
        var chip = crit[t.id] ? '<span class="lp-crit">关键</span>' : '';
        var conf = _conf[t.id] ? '<span class="lp-conf">冲突</span>' : '';
        var mile = t.milestone ? '◆ ' : '';
        html.push('<div class="lp-task" data-id="' + t.id + '" style="height:' + r.h + 'px">'
          + '<span class="lp-name">' + mile + esc(t.name) + '</span>' + conf + chip + '</div>');
      }
    });
    document.getElementById('gantt-left').innerHTML = html.join('');
  }

  /* ---------------- 交互 ---------------- */
  function svg() { return document.getElementById('gantt-svg'); }

  function bind() {
    var s = svg();
    s.addEventListener('pointerdown', onDown);
    s.addEventListener('pointermove', onMove);
    s.addEventListener('pointerup', onUp);
    s.addEventListener('pointerover', onOver);
    s.addEventListener('pointerout', onOut);
  }

  function findTaskId(target) {
    var g = target.closest('[data-id]');
    return g ? g.getAttribute('data-id') : null;
  }
  function findHandle(target) {
    var el = target;
    while (el && el !== svg()) {
      if (el.getAttribute && el.getAttribute('data-handle')) return el.getAttribute('data-handle');
      el = el.parentNode;
    }
    return null;
  }

  function onDown(e) {
    var id = findTaskId(e.target);
    if (!id) return;
    if (linkMode) {
      if (!linkSource) { linkSource = id; render(); showHint('已选中「' + (AppState.getTask(id) || {}).name + '」，点击另一个任务建立依赖'); return; }
      var src = linkSource, dst = id;
      linkSource = null;
      if (src === dst) { render(); return; }
      var t = AppState.getTask(dst);
      if (t && (!t.deps || t.deps.indexOf(src) < 0)) { t.deps = (t.deps || []).concat(src); AppState.save(); }
      render(); App.refreshTable(); hideHint();
      return;
    }
    var handle = findHandle(e.target);
    if (!handle) return;
    var t = AppState.getTask(id);
    if (!t) return;
    svg().setPointerCapture(e.pointerId);
    drag = { handle: handle, id: id, startX: e.clientX, s0: DateUtil.toDay(t.start), e0: DateUtil.toDay(t.end), dayWidth: layout.zw };
    e.preventDefault();
  }

  function onMove(e) {
    if (!drag) return;
    var t = AppState.getTask(drag.id);
    if (!t) return;
    var delta = Math.round((e.clientX - drag.startX) / drag.dayWidth);
    if (t.milestone || drag.handle === 'body') {
      var ns = drag.s0 + delta, ne = drag.e0 + delta;
      t.start = DateUtil.fromDay(ns); t.end = DateUtil.fromDay(ne);
    } else if (drag.handle === 'left') {
      var ls = drag.s0 + delta; if (ls > drag.e0) ls = drag.e0;
      t.start = DateUtil.fromDay(ls);
    } else if (drag.handle === 'right') {
      var re = drag.e0 + delta; if (re < drag.s0) re = drag.s0;
      t.end = DateUtil.fromDay(re);
    }
    render();
  }

  function onUp(e) {
    if (!drag) return;
    var id = drag.id;
    drag = null;
    Scheduler.autoSchedule(AppState.getTasks(), id);
    AppState.save();
    render();
    App.refreshTable();
  }

  function onOver(e) {
    var id = findTaskId(e.target);
    if (!id) return hideTooltip();
    var t = AppState.getTask(id);
    if (!t) return;
    var crit = Scheduler.criticalIds(AppState.getTasks());
    var html = '<b>' + esc(t.name) + '</b>' + (crit[id] ? ' <span style="color:' + AppState.criticalColor() + '">●关键</span>' : '')
      + '<br>项目：' + esc(t.project || '—')
      + '<br>时间：' + t.start + ' ~ ' + t.end + (t.milestone ? '（里程碑）' : '')
      + '<br>进度：' + (t.progress || 0) + '%'
      + (t.resource ? '<br>负责人：' + esc(t.resource) : '')
      + (_conf[id] ? '<br><span style="color:#d98a00">⚠ 资源冲突：与其它任务时间重叠</span>' : '');
    showTooltip(e.clientX, e.clientY, html);
  }
  function onOut(e) { if (!findTaskId(e.target)) hideTooltip(); }

  function showTooltip(x, y, html) {
    var el = document.getElementById('tooltip');
    el.innerHTML = html;
    el.style.display = 'block';
    var w = el.offsetWidth, h = el.offsetHeight;
    var px = x + 14, py = y + 14;
    if (px + w > window.innerWidth) px = x - w - 14;
    if (py + h > window.innerHeight) py = y - h - 14;
    el.style.left = px + 'px'; el.style.top = py + 'px';
  }
  function hideTooltip() { var el = document.getElementById('tooltip'); el.style.display = 'none'; }

  function showHint(msg) { var el = document.getElementById('hint'); el.textContent = msg; el.style.display = 'block'; }
  function hideHint() { var el = document.getElementById('hint'); el.style.display = 'none'; }

  function setZoom(z) { zoom = z; render(); }
  function setLinkMode(v) {
    linkMode = v; linkSource = null;
    if (!v) hideHint();
    render();
  }

  return { render: render, setZoom: setZoom, setLinkMode: setLinkMode, isLinkMode: function () { return linkMode; }, bind: bind };
})();
