/* =========================================================================
 * data.js — 数据模型、调色板、日期工具、持久化、示例数据
 * ========================================================================= */

/* 日期工具：内部统一用「天序号」(自 1970-01-01 的天数, UTC) 做几何计算，
 * 避免夏令时/时区导致的误差。对外接口一律是 'YYYY-MM-DD' 字符串。 */
window.DateUtil = (function () {
  var DAY = 86400000;

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function toDay(str) {
    if (!str) return 0;
    var m = String(str).split('-').map(Number);
    if (m.length < 3 || m.some(isNaN)) return 0;
    return Math.round(Date.UTC(m[0], m[1] - 1, m[2]) / DAY);
  }

  function fromDay(n) {
    var d = new Date(n * DAY);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  function addDays(str, n) { return fromDay(toDay(str) + n); }

  function diffDays(a, b) { return toDay(b) - toDay(a); } // b - a

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function isWeekend(dayNum) {
    // 0 = 周日, 6 = 周六
    var wd = new Date(dayNum * DAY).getUTCDay();
    return wd === 0 || wd === 6;
  }

  return { pad: pad, toDay: toDay, fromDay: fromDay, addDays: addDays,
           diffDays: diffDays, todayStr: todayStr, isWeekend: isWeekend };
})();

/* 任务时长（天，含首尾）。里程碑为 0 天。 */
function taskDuration(t) {
  if (t.milestone) return 0;
  return Math.max(1, DateUtil.diffDays(t.start, t.end) + 1);
}

/* 全局数据与调色板 */
window.AppState = (function () {
  var KEY = 'gantt-chart-data-v1';
  var theme = localStorage.getItem('gantt-theme') || 'light';

  /* 兜底色板（正常由 Themes 色系提供） */
  var DEFAULT_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100',
                        '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

  var tasks = [];
  var projectOrder = [];   // 项目首次出现顺序（用于固定颜色）

  function uid() {
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function currentColors() {
    return (window.Themes && Themes.currentColors) ? Themes.currentColors() : DEFAULT_COLORS;
  }

  function chrome() {
    return theme === 'dark'
      ? { surface: '#1a1a19', ink: '#ffffff', ink2: '#c3c2b7', muted: '#898781',
          grid: '#2c2c2a', baseline: '#383835', border: 'rgba(255,255,255,0.10)' }
      : { surface: '#fcfcfb', ink: '#0b0b0b', ink2: '#52514e', muted: '#898781',
          grid: '#e1e0d9', baseline: '#c3c2b7', border: 'rgba(11,11,11,0.10)' };
  }

  /* 关键路径用状态色（固定，不随主题变） */
  function criticalColor() { return '#d03b3b'; }

  /* 项目 -> 颜色（按首次出现顺序取色，永不因增删项目而重排已有项目） */
  function projectColor(project) {
    var key = project || '未分组';
    var idx = projectOrder.indexOf(key);
    if (idx < 0) { projectOrder.push(key); idx = projectOrder.length - 1; }
    var p = currentColors();
    return p[idx % p.length];
  }

  function getTasks() { return tasks; }

  function setTasks(arr) {
    tasks = arr.slice();
    projectOrder = [];
    tasks.forEach(function (t) { projectColor(t.project); }); // 重建顺序
  }

  function addTask(t) {
    t.id = t.id || uid();
    tasks.push(t);
    projectColor(t.project);
    return t;
  }

  function removeTask(id) {
    tasks = tasks.filter(function (t) { return t.id !== id; });
    // 清理指向被删任务的依赖
    tasks.forEach(function (t) {
      if (t.deps) t.deps = t.deps.filter(function (d) { return d !== id; });
    });
  }

  function getTask(id) {
    for (var i = 0; i < tasks.length; i++) if (tasks[i].id === id) return tasks[i];
    return null;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(tasks)); } catch (e) {}
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) { setTasks(JSON.parse(raw)); return true; }
    } catch (e) {}
    return false;
  }

  function setTheme(t) {
    theme = t;
    localStorage.setItem('gantt-theme', t);
  }

  function sample() {
    var mk = function (name, project, start, len, opts) {
      opts = opts || {};
      return {
        id: uid(), name: name, project: project,
        start: start, end: DateUtil.addDays(start, Math.max(0, len - 1)),
        progress: opts.progress || 0, deps: opts.deps || [],
        milestone: !!opts.milestone, resource: opts.resource || '',
        color: opts.color || null
      };
    };

    var a1 = mk('需求分析', '网站改版', DateUtil.todayStr(), 5, { progress: 100, resource: '张伟' });
    var a2 = mk('UI 设计', '网站改版', DateUtil.addDays(a1.end, 1), 6, { progress: 60, deps: [a1.id], resource: '李娜' });
    var a3 = mk('前端开发', '网站改版', DateUtil.addDays(a2.end, 1), 10, { progress: 20, deps: [a2.id], resource: '王强' });
    var a4 = mk('后端接口', '网站改版', DateUtil.addDays(a2.end, 1), 8, { progress: 40, deps: [a2.id], resource: '王强' });
    var a5 = mk('联调测试', '网站改版', DateUtil.addDays(a3.end, 1), 4, { progress: 0, deps: [a3.id, a4.id], resource: '李娜' });
    var a6 = mk('上线发布', '网站改版', DateUtil.addDays(a5.end, 1), 0, { milestone: true, deps: [a5.id] });

    var b1 = mk('市场调研', 'App 开发', DateUtil.addDays(a1.start, 2), 6, { progress: 30, resource: '赵敏' });
    var b2 = mk('原型设计', 'App 开发', DateUtil.addDays(b1.end, 1), 5, { progress: 0, deps: [b1.id], resource: '李娜' });

    return [a1, a2, a3, a4, a5, a6, b1, b2];
  }

  return {
    uid: uid, currentColors: currentColors, chrome: chrome, criticalColor: criticalColor,
    projectColor: projectColor, getTasks: getTasks, setTasks: setTasks,
    addTask: addTask, removeTask: removeTask, getTask: getTask,
    save: save, load: load, setTheme: setTheme, sample: sample,
    theme: function () { return theme; }
  };
})();
