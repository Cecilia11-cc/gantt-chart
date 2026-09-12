/* =========================================================================
 * import.js — 数据导入导出：CSV / Excel(SheetJS) / JSON，图片 PNG，打印
 * ========================================================================= */

window.ImportExport = (function () {
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* 日期归一化：兼容 ISO、斜杠、Excel 序列号、Date 对象 */
  function normalizeDate(v) {
    if (v instanceof Date && !isNaN(v)) return v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate());
    var s = String(v == null ? '' : v).trim();
    if (!s) return '';
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
      var p = s.split('-').map(Number); return p[0] + '-' + pad(p[1]) + '-' + pad(p[2]);
    }
    if (/^\d+(\.\d+)?$/.test(s)) { // Excel 1900 序列号
      var n = +s;
      if (n > 59 && n < 60000) {
        var d = new Date(Date.UTC(1899, 11, 30) + Math.round(n * 86400000));
        return d.toISOString().slice(0, 10);
      }
    }
    var m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (m) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
    var m2 = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (m2) return m2[3] + '-' + pad(+m2[1]) + '-' + pad(+m2[2]);
    var dd = new Date(s);
    if (!isNaN(dd)) return dd.getFullYear() + '-' + pad(dd.getMonth() + 1) + '-' + pad(dd.getDate());
    return s;
  }

  /* 表头别名 → 字段 */
  var HEADER_ALIAS = {
    name: ['任务名', '名称', '任务', 'name', 'task', 'task name', '标题'],
    project: ['项目', '所属项目', '工程', 'project'],
    start: ['开始日期', '开始时间', '开始', 'start', 'start date', 'from'],
    end: ['结束日期', '结束时间', '结束', '截止', 'end', 'end date', 'due', 'to'],
    progress: ['进度', '完成度', '完成百分比', 'progress', 'percent', 'pct'],
    deps: ['前置任务', '前置', '依赖', '前置依赖', 'deps', 'dependencies', 'predecessors'],
    resource: ['负责人', '资源', '资源分配', 'resource', 'assignee', 'owner'],
    milestone: ['里程碑', 'milestone']
  };

  function mapHeader(row) {
    var map = {};
    row.forEach(function (h, i) {
      var key = String(h).trim().toLowerCase();
      for (var field in HEADER_ALIAS) {
        if (HEADER_ALIAS[field].indexOf(key) >= 0 || HEADER_ALIAS[field].indexOf(h) >= 0) {
          map[field] = i; break;
        }
      }
    });
    return map;
  }

  function rowsToTasks(rows) {
    if (!rows.length) return [];
    var header = rows[0];
    var map = mapHeader(header);
    if (map.name === undefined) return []; // 必须能识别任务名列

    var tasks = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      var name = String(r[map.name] == null ? '' : r[map.name]).trim();
      if (!name) continue;
      var start = normalizeDate(r[map.start]);
      var end = normalizeDate(r[map.end]);
      if (!start) continue;
      if (!end || DateUtil.toDay(end) < DateUtil.toDay(start)) end = start;

      var progress = parseInt(r[map.progress], 10) || 0;
      progress = Math.max(0, Math.min(100, progress));

      var milestone = /^(1|true|是|y|yes)$/i.test(String(r[map.milestone] || ''));

      var task = {
        id: AppState.uid(),
        name: name,
        project: String(r[map.project] == null ? '' : r[map.project]).trim(),
        start: start,
        end: milestone ? start : end,
        progress: progress,
        deps: [],
        milestone: milestone,
        resource: String(r[map.resource] == null ? '' : r[map.resource]).trim(),
        color: null,
        _depNames: map.deps != null ? String(r[map.deps] == null ? '' : r[map.deps]).split(/[,，;；、\s]+/).filter(Boolean) : []
      };
      tasks.push(task);
    }

    // 解析依赖名 → id
    var nameToId = {};
    tasks.forEach(function (t) { nameToId[t.name] = t.id; });
    tasks.forEach(function (t) {
      t.deps = t._depNames.map(function (n) { return nameToId[n]; }).filter(Boolean);
      delete t._depNames;
    });
    return tasks;
  }

  /* CSV 解析（支持引号、逗号、换行、CRLF） */
  function parseCSV(text) {
    var rows = [], row = [], cell = '', inQ = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQ) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
        else cell += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ',') { row.push(cell); cell = ''; }
        else if (ch === '\n' || ch === '\r') {
          if (ch === '\r' && text[i + 1] === '\n') i++;
          row.push(cell); cell = '';
          if (row.some(function (c) { return c !== ''; })) rows.push(row);
          row = [];
        }
        else cell += ch;
      }
    }
    row.push(cell);
    if (row.some(function (c) { return c !== ''; })) rows.push(row);
    return rows;
  }

  function applyTasks(tasks) {
    if (!tasks.length) { alert('未导入到任何任务，请检查文件列名（需包含「任务名」「开始日期」等）。'); return; }
    AppState.setTasks(tasks);
    AppState.save();
    App.renderAll();
    alert('成功导入 ' + tasks.length + ' 个任务。');
  }

  function importCSVText(text) { applyTasks(rowsToTasks(parseCSV(text))); }

  function importExcelData(data) {
    if (typeof XLSX === 'undefined') { alert('Excel 导入需要联网加载解析库（SheetJS）。离线时请改用 CSV 导入。'); return; }
    var wb = XLSX.read(data, { type: 'array' });
    var ws = wb.Sheets[wb.SheetNames[0]];
    var rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    applyTasks(rowsToTasks(rows));
  }

  function importJSONText(text) {
    var arr = JSON.parse(text);
    if (!Array.isArray(arr)) throw new Error('JSON 需为任务数组');
    var tasks = arr.map(function (t) {
      return {
        id: t.id || AppState.uid(), name: t.name || '未命名', project: t.project || '',
        start: t.start, end: t.end || t.start, progress: t.progress || 0,
        deps: t.deps || [], milestone: !!t.milestone, resource: t.resource || '', color: t.color || null
      };
    });
    applyTasks(tasks);
  }

  /* 文件入口 */
  function handleFile(file, kind) {
    var reader = new FileReader();
    if (kind === 'excel') { reader.onload = function () { importExcelData(reader.result); }; reader.readAsArrayBuffer(file); }
    else {
      reader.onload = function () {
        var text = reader.result;
        if (kind === 'json') { try { importJSONText(text); } catch (e) { alert('JSON 解析失败：' + e.message); } }
        else importCSVText(text);
      };
      reader.readAsText(file, 'utf-8');
    }
  }

  /* ---------------- 导出 ---------------- */
  function downloadBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function exportJSON() {
    var tasks = AppState.getTasks();
    var clean = tasks.map(function (t) { return { id: t.id, name: t.name, project: t.project, start: t.start, end: t.end, progress: t.progress, deps: t.deps, milestone: t.milestone, resource: t.resource, color: t.color }; });
    downloadBlob(new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' }), 'gantt.json');
  }

  function exportPNG() {
    var svg = document.getElementById('gantt-svg');
    var vb = svg.viewBox.baseVal;
    var w = vb.width, h = vb.height;
    var clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', w);
    clone.setAttribute('height', h);
    var xml = new XMLSerializer().serializeToString(clone);
    var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    var img = new Image();
    img.onload = function () {
      var scale = 2;
      var canvas = document.createElement('canvas');
      canvas.width = w * scale; canvas.height = h * scale;
      var ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(function (blob) { downloadBlob(blob, 'gantt.png'); }, 'image/png');
    };
    img.onerror = function () { alert('导出失败'); };
    img.src = url;
  }

  return { handleFile: handleFile, importCSVText: importCSVText, exportJSON: exportJSON, exportPNG: exportPNG };
})();
