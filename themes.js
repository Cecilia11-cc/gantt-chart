/* =========================================================================
 * themes.js — 色系（配色主题）：预置色板 + 用户自定义色系的持久化
 * ========================================================================= */

window.Themes = (function () {
  var KEY = 'gantt-custom-themes-v1';
  var CUR_KEY = 'gantt-theme-current-v1';

  /* 预置色系（每套 8 色，按项目分组顺序取用） */
  var PRESETS = [
    { id: 'default', name: '默认', colors: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'] },
    { id: 'moss', name: '苔林', colors: ['#2f7d4f', '#4c9a5e', '#7ba05b', '#a3b86c', '#5b8c5a', '#2d6a4f', '#78a86a', '#1b4332'] },
    { id: 'morandi', name: '莫兰迪', colors: ['#c1a88c', '#9db2a7', '#b79bb0', '#9aa7ad', '#cdbfa8', '#a89b8c', '#8fa3ad', '#c4b6a1'] },
    { id: 'dunhuang', name: '敦煌', colors: ['#1f5f8b', '#3a9e8f', '#c9a227', '#b5621f', '#c14b2d', '#7a5c2e', '#2f7d6d', '#8c3b2e'] },
    { id: 'plain', name: '素简', colors: ['#2a78d6', '#6c757d', '#495057', '#868e96', '#adb5bd', '#3a86c8', '#5c677d', '#0b7285'] },
    { id: 'sunset', name: '余晖', colors: ['#f4a261', '#e76f51', '#e9c46a', '#f28482', '#d95d39', '#ee8959', '#f6bd60', '#8a5a44'] },
    { id: 'rose', name: '蔷薇', colors: ['#e87ba4', '#d55181', '#f3a0b8', '#c94f7c', '#b74e72', '#f0a6ca', '#a84a6d', '#e08bab'] },
    { id: 'lake', name: '碧波', colors: ['#0a9396', '#1baf7a', '#2a9d8f', '#5f9ea0', '#3a86c8', '#00b4d8', '#2c7da0', '#61a5c2'] },
    { id: 'starry', name: '星野', colors: ['#3a0ca3', '#4a3aa7', '#4361ee', '#7209b7', '#1f4e79', '#9085e9', '#b39ddb', '#f4d03f'] },
    { id: 'dune', name: '沙丘', colors: ['#d4a373', '#cc8b4a', '#b5651d', '#e2b13c', '#c17a43', '#9c6644', '#e6b566', '#7f5539'] },
    { id: 'ink', name: '墨色', colors: ['#7f7f7f', '#4a4a4a', '#a0a0a0', '#2f2f2f', '#bdbdbd', '#5c5c5c', '#8f8f8f', '#1f1f1f'] },
    { id: 'rainbow', name: '虹霓', colors: ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#e84393'] }
  ];

  var _preview = null;       // 悬停预览中的色系 id
  var _previewColors = null; // 直接预览一组颜色（自定义编辑时）

  function loadCustom() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
  }
  function saveCustom(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} }

  function all() { return PRESETS.concat(loadCustom()); }

  function get(id) {
    var list = all();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function currentId() { return localStorage.getItem(CUR_KEY) || 'default'; }
  function setCurrent(id) { try { localStorage.setItem(CUR_KEY, id); } catch (e) {} }

  function currentColors() {
    if (_previewColors) return _previewColors;
    var id = _preview || currentId();
    var t = get(id) || PRESETS[0];
    return t.colors;
  }

  function preview(id) { _preview = id; _previewColors = null; }
  function previewColors(colors) { _previewColors = colors; _preview = null; }
  function clearPreview() { _preview = null; _previewColors = null; }

  function addCustom(name, colors) {
    var list = loadCustom();
    var t = { id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name, colors: colors, custom: true };
    list.push(t);
    saveCustom(list);
    return t;
  }

  function removeCustom(id) {
    saveCustom(loadCustom().filter(function (t) { return t.id !== id; }));
  }

  return {
    PRESETS: PRESETS, all: all, get: get,
    currentId: currentId, setCurrent: setCurrent,
    currentColors: currentColors, preview: preview, previewColors: previewColors, clearPreview: clearPreview,
    addCustom: addCustom, removeCustom: removeCustom
  };
})();
