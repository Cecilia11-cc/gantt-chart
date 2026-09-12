/* =========================================================================
 * scheduler.js — 排期引擎：CPM 关键路径 + 拖拽后自动顺延下游
 * ========================================================================= */

window.Scheduler = (function () {
  var EPS = 1e-6;

  /* 计算每个任务的最早/最晚开始结束与松弛量，识别关键路径。
   * 时间单位为「天」，相对项目最早开始（0）。依赖为 FS（完成-开始）。 */
  function compute(tasks) {
    var byId = {};
    tasks.forEach(function (t) {
      byId[t.id] = { id: t.id, dur: taskDuration(t), ES: 0, EF: 0, LS: 0, LF: 0, slack: 0, critical: false };
    });
    var n = tasks.length;

    // 正推：最长路径（Bellman-Ford 式，先初始化 EF 再迭代松弛；可容忍环）
    tasks.forEach(function (t) { byId[t.id].EF = byId[t.id].ES + byId[t.id].dur; });
    var changed = true, iter = 0;
    while (changed && iter < n) {
      changed = false;
      tasks.forEach(function (t) {
        var r = byId[t.id];
        (t.deps || []).forEach(function (depId) {
          var dep = byId[depId];
          if (dep && dep.EF > r.ES + EPS) { r.ES = dep.EF; changed = true; }
        });
        r.EF = r.ES + r.dur;
      });
      iter++;
    }

    var projectEnd = 0;
    tasks.forEach(function (t) { projectEnd = Math.max(projectEnd, byId[t.id].EF); });

    // 逆推：t.LF = min(所有后继 s 的 LS)，LS = LF - dur
    tasks.forEach(function (t) { var r = byId[t.id]; r.LF = projectEnd; r.LS = r.LF - r.dur; });
    changed = true; iter = 0;
    while (changed && iter < n) {
      changed = false;
      tasks.forEach(function (t) {
        var r = byId[t.id];
        tasks.forEach(function (s) {
          if ((s.deps || []).indexOf(t.id) >= 0) {
            var succ = byId[s.id];
            if (succ.LS < r.LF - EPS) { r.LF = succ.LS; changed = true; }
          }
        });
        r.LS = r.LF - r.dur;
      });
      iter++;
    }

    tasks.forEach(function (t) {
      var r = byId[t.id];
      r.slack = r.LS - r.ES;
      r.critical = r.slack <= EPS;
    });

    return byId;
  }

  /* 关键路径任务 id 集合 */
  function criticalIds(tasks) {
    var c = compute(tasks);
    var set = {};
    tasks.forEach(function (t) { if (c[t.id].critical) set[t.id] = true; });
    return set;
  }

  /* 拖拽/改期后自动顺延下游：若某任务被其前置「顶到」，向后平移，级联传递。
   * 只向后推、不向前拉。 */
  function autoSchedule(tasks, movedId) {
    var byId = {};
    tasks.forEach(function (t) { byId[t.id] = t; });

    var queue = [movedId], visited = {};
    while (queue.length) {
      var id = queue.shift();
      if (visited[id]) continue;
      visited[id] = true;
      var t = byId[id];
      if (!t) continue;
      var tEnd = DateUtil.toDay(t.end);
      tasks.forEach(function (other) {
        if ((other.deps || []).indexOf(id) >= 0) {
          var minStart = tEnd + 1;
          if (DateUtil.toDay(other.start) < minStart) {
            var dur = taskDuration(other);
            other.start = DateUtil.fromDay(minStart);
            other.end = DateUtil.fromDay(minStart + (other.milestone ? 0 : dur - 1));
            queue.push(other.id);
          }
        }
      });
    }
  }

  /* 资源冲突：同一负责人名下、时间区间重叠的任务，返回其 id 集合 */
  function resourceConflicts(tasks) {
    var byRes = {};
    tasks.forEach(function (t) {
      var r = String(t.resource || '').trim();
      if (!r) return;
      (byRes[r] = byRes[r] || []).push(t);
    });
    var set = {};
    Object.keys(byRes).forEach(function (r) {
      var list = byRes[r];
      for (var i = 0; i < list.length; i++) {
        for (var j = i + 1; j < list.length; j++) {
          var a = list[i], b = list[j];
          var aS = DateUtil.toDay(a.start), aE = DateUtil.toDay(a.end);
          var bS = DateUtil.toDay(b.start), bE = DateUtil.toDay(b.end);
          if (aS <= bE && bS <= aE) { set[a.id] = true; set[b.id] = true; }
        }
      }
    });
    return set;
  }

  return { compute: compute, criticalIds: criticalIds, autoSchedule: autoSchedule, resourceConflicts: resourceConflicts };
})();
