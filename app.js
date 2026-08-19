const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const PACK_STORAGE_KEY = 'my-story-vocab-pack-v1';
const wordSeaFlipTimers = new Map();
const SAMPLE_PACK = window.VOCAB_SAMPLE_PACK;

let currentPack;
let GROUPS = [];
let WORD_DETAILS = {};
let WORD_ORIGINS = {};
let WORD_FORMS = {};
let CANDIDATES = [];
let DEFAULT_COMPLETE_GROUPS = new Set();
let candidatePool = [];
let gi = Number(localStorage.getItem('pwaGroup') || 0);
let screen = localStorage.getItem('pwaScreen') || 'study';
let recall = null;
let quiz = null;
let storyListOpen = false;
let storyEditMode = false;
let longPressTimer = null;
let longPressOrigin = null;
let suppressStoryClick = false;
let recallAnswersVisible = false;
let pendingPack = null;
let deferredPrompt = null;
let speechEnabled = localStorage.getItem('pwaSpeechEnabled') !== 'false';
const speechSupported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char])); }
function safeHtml(value) {
  const template = document.createElement('template');
  template.innerHTML = String(value || '');
  const allowed = new Set(['BR', 'B', 'STRONG', 'EM', 'I']);
  template.content.querySelectorAll('*').forEach(element => {
    if (!allowed.has(element.tagName)) element.replaceWith(document.createTextNode(element.textContent || ''));
    else [...element.attributes].forEach(attribute => element.removeAttribute(attribute.name));
  });
  return template.innerHTML;
}
function normalizeWord(raw) {
  if (Array.isArray(raw)) return [String(raw[0] || ''), String(raw[1] || ''), String(raw[2] || ''), String(raw[3] || ''), raw[4] || {}];
  const detail = raw.detail || {};
  return [String(raw.word || ''), String(raw.meaning || ''), String(raw.hook || raw.explanation || ''), String(raw.collocations || raw.collocation || ''), { explanation: raw.explanation || detail.explanation || '', origin: raw.origin || detail.origin || '', example: raw.example || detail.example || '' }];
}
function normalizeQuiz(raw) {
  return { q: String(raw.q || raw.question || ''), o: (raw.o || raw.options || []).map(String), a: Number(raw.a ?? raw.answer ?? 0), f: String(raw.f || raw.explanation || '') };
}
function normalizeGroup(raw, index) {
  const words = (raw.words || []).map(normalizeWord).filter(word => word[0]);
  const quizItems = (raw.quiz || []).map(normalizeQuiz).filter(item => item.q && item.o.length);
  return { id: String(raw.id || `group-${index + 1}`), topic: String(raw.topic || raw.subtitle || raw.title || `故事 ${index + 1}`), title: String(raw.title || raw.topic || `故事 ${index + 1}`), subtitle: String(raw.subtitle || raw.topic || ''), tag: String(raw.tag || ''), storyTitle: String(raw.storyTitle || raw.title || raw.topic || `故事 ${index + 1}`), englishTitle: String(raw.englishTitle || ''), story: String(raw.story || ''), words, quiz: quizItems };
}
function normalizeCandidate(raw) {
  if (typeof raw === 'string') return { word: raw, meaning: '待补充释义' };
  return { word: String(raw.word || ''), meaning: String(raw.meaning || '待补充释义') };
}
function normalizePack(raw) {
  if (!raw || !Array.isArray(raw.groups) || !raw.groups.length) throw new Error('文件里没有可用的 groups 故事组。');
  const groups = raw.groups.map(normalizeGroup).filter(group => group.words.length && group.quiz.length);
  if (!groups.length) throw new Error('故事组必须至少包含词汇和 Quiz。');
  const candidates = (raw.candidates || raw.words || []).map(normalizeCandidate).filter(item => item.word);
  return { schemaVersion: 1, title: String(raw.title || '我的故事词汇学习器'), subtitle: String(raw.subtitle || '导入你的故事包 · 阅读 → 回忆 → Quiz'), groups, candidates, wordDetails: raw.wordDetails || {}, wordOrigins: raw.wordOrigins || {}, wordForms: raw.wordForms || {}, aliases: raw.aliases || {}, defaultCompleteGroups: Array.isArray(raw.defaultCompleteGroups) ? raw.defaultCompleteGroups.map(String) : [] };
}
function storedPack() {
  try { const raw = localStorage.getItem(PACK_STORAGE_KEY); return raw ? normalizePack(JSON.parse(raw)) : normalizePack(SAMPLE_PACK); } catch { return normalizePack(SAMPLE_PACK); }
}
function savePack(pack) { localStorage.setItem(PACK_STORAGE_KEY, JSON.stringify(pack)); }
function applyPack(pack) {
  currentPack = normalizePack(pack);
  GROUPS = currentPack.groups;
  WORD_DETAILS = currentPack.wordDetails;
  WORD_ORIGINS = currentPack.wordOrigins;
  WORD_FORMS = currentPack.wordForms;
  CANDIDATES = currentPack.candidates;
  candidatePool = CANDIDATES;
  DEFAULT_COMPLETE_GROUPS = new Set(currentPack.defaultCompleteGroups);
  document.title = currentPack.title;
  const brand = $('.brand');
  const subtitle = $('.small');
  if (brand) brand.textContent = currentPack.title;
  if (subtitle) subtitle.textContent = currentPack.subtitle;
}
function mergePacks(base, incoming) {
  const groups = new Map(base.groups.map(group => [group.id, group]));
  incoming.groups.forEach(group => groups.set(group.id, group));
  const candidates = new Map(base.candidates.concat(incoming.candidates).map(item => [item.word, item]));
  return normalizePack({ ...base, ...incoming, groups: [...groups.values()], candidates: [...candidates.values()], defaultCompleteGroups: [...new Set([...base.defaultCompleteGroups, ...incoming.defaultCompleteGroups])] });
}
function clearLearningProgress() {
  Object.keys(localStorage).filter(key => key.startsWith('ieltsau_')).forEach(key => localStorage.removeItem(key));
}

applyPack(storedPack());
if (gi >= GROUPS.length) gi = 0;

function storyMeta(group) { return { title: group.storyTitle, englishTitle: group.englishTitle, topics: [group.topic] }; }
function wordId(word) { return `word-${String(word).toLowerCase().replace(/[^a-z0-9-]/g, '-')}`; }
function isStoryComplete(group) { const saved = JSON.parse(localStorage.getItem(`ieltsau_${group.id}_quiz`) || 'null'); return saved ? saved.index >= group.quiz.length : DEFAULT_COMPLETE_GROUPS.has(group.id); }
function key(type) { return `ieltsau_${GROUPS[gi].id}_${type}`; }
function shuffle(values) { const result = [...values]; for (let i = result.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; } return result; }
function loadRecall() { recall = JSON.parse(localStorage.getItem(key('recall')) || 'null') || { answers: [{}], listOrder: shuffle(GROUPS[gi].words.map(word => word[0])) }; }
function saveRecall() { localStorage.setItem(key('recall'), JSON.stringify(recall)); }
function loadQuiz() { quiz = JSON.parse(localStorage.getItem(key('quiz')) || 'null') || (DEFAULT_COMPLETE_GROUPS.has(GROUPS[gi].id) ? { index: GROUPS[gi].quiz.length, score: GROUPS[gi].quiz.length, wrong: [], locked: false } : { index: 0, score: 0, wrong: [], locked: false }); }
function saveQuiz() { localStorage.setItem(key('quiz'), JSON.stringify(quiz)); }

function speakWord(word) {
  if (!speechEnabled || !speechSupported) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = 'en-US';
  utterance.rate = 0.86;
  window.speechSynthesis.speak(utterance);
}
function renderSpeechToggle() {
  const button = $('#speechToggle');
  if (!button) return;
  button.disabled = !speechSupported;
  button.textContent = speechSupported ? `自动发音：${speechEnabled ? '开' : '关'}` : '自动发音：不可用';
  button.setAttribute('aria-pressed', String(speechEnabled));
  button.title = speechSupported ? '点击关闭或开启故事词汇的自动发音' : '当前浏览器不支持网页发音';
}
function toggleSpeech() {
  if (!speechSupported) return;
  speechEnabled = !speechEnabled;
  localStorage.setItem('pwaSpeechEnabled', String(speechEnabled));
  if (!speechEnabled) window.speechSynthesis.cancel();
  renderSpeechToggle();
}

function renderGroups() {
  const sorted = GROUPS.map((group, index) => ({ group, index, complete: isStoryComplete(group) })).sort((a, b) => Number(a.complete) - Number(b.complete) || a.index - b.index);
  const visible = sorted.slice(0, 3);
  const overflow = sorted.slice(3);
  if (!overflow.length) storyListOpen = false;
  const button = item => `<div class="story-option-wrap"><button class="story-option ${item.index === gi ? 'active' : ''}" data-group-index="${item.index}" title="长按进入故事编辑模式"><span>${escapeHtml(storyMeta(item.group).topics[0])}</span>${item.complete ? '<b class="story-check">✓</b>' : ''}</button>${storyEditMode ? `<button class="story-remove" data-story-delete="${item.index}" aria-label="删除故事：${escapeHtml(storyMeta(item.group).topics[0])}" title="${GROUPS.length > 1 ? '删除这个故事' : '至少保留一个故事'}" ${GROUPS.length <= 1 ? 'disabled' : ''}>×</button>` : ''}</div>`;
  const moreToggle = overflow.length && !storyEditMode ? `<button class="story-more-toggle" id="storyMoreToggle"><span>更多故事</span><span>${storyListOpen ? '⌃' : '⌄'}</span></button>` : '';
  const editBar = storyEditMode ? '<div class="story-edit-bar"><span>编辑故事</span><button id="storyEditDone" type="button">完成</button></div>' : '';
  $('#groups').innerHTML = `${editBar}<div class="story-strip">${visible.map(button).join('')}</div>${overflow.length ? `${moreToggle}<div class="story-list ${storyListOpen || storyEditMode ? 'open' : ''}">${overflow.map(button).join('')}</div>` : ''}`;
  if (overflow.length && !storyEditMode) $('#storyMoreToggle').onclick = () => { storyListOpen = !storyListOpen; renderGroups(); };
  if (storyEditMode) $('#storyEditDone').onclick = () => { storyEditMode = false; storyListOpen = false; suppressStoryClick = false; renderGroups(); };
  bindStoryPicker();
}
function cancelLongPress() {
  if (longPressTimer) clearTimeout(longPressTimer);
  longPressTimer = null;
  longPressOrigin = null;
}
function enterStoryEditMode() {
  cancelLongPress();
  suppressStoryClick = true;
  storyEditMode = true;
  storyListOpen = true;
  renderGroups();
}
function bindStoryPicker() {
  $$('.story-option').forEach(buttonElement => {
    buttonElement.onclick = () => {
      if (suppressStoryClick) { suppressStoryClick = false; return; }
      gi = Number(buttonElement.dataset.groupIndex);
      storyListOpen = false;
      localStorage.setItem('pwaGroup', String(gi));
      loadRecall();
      loadQuiz();
      renderGroups();
      renderAll();
    };
    buttonElement.onpointerdown = event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      longPressOrigin = { x: event.clientX, y: event.clientY };
      longPressTimer = setTimeout(enterStoryEditMode, 520);
    };
    buttonElement.onpointermove = event => {
      if (!longPressOrigin) return;
      if (Math.hypot(event.clientX - longPressOrigin.x, event.clientY - longPressOrigin.y) > 10) cancelLongPress();
    };
    buttonElement.onpointerup = cancelLongPress;
    buttonElement.onpointercancel = cancelLongPress;
    buttonElement.oncontextmenu = event => { event.preventDefault(); enterStoryEditMode(); };
  });
  $$('[data-story-delete]').forEach(buttonElement => buttonElement.onclick = event => { event.stopPropagation(); deleteStoryAt(Number(buttonElement.dataset.storyDelete)); });
}
function showScreen(next) {
  screen = next;
  localStorage.setItem('pwaScreen', next);
  const overlay = next === 'recall';
  $$('.screen').forEach(element => element.classList.toggle('active', overlay ? element.id === 'study' || element.id === 'recall' : element.id === next));
  $('#recall').classList.toggle('recall-overlay', overlay);
  $$('.navbtn').forEach(button => button.classList.toggle('active', button.dataset.screen === next));
  if (overlay) renderRecall();
  if (next === 'quiz') renderQuiz();
  if (next === 'progress') renderProgress();
}
$$('.navbtn').forEach(button => button.onclick = () => showScreen(button.dataset.screen));
function openWord(word) { const card = document.getElementById(wordId(WORD_FORMS[word] || word)); if (!card) return; card.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
function bindStudyLinks() {
  $$('.story-word').forEach(button => button.onclick = () => { speakWord(button.dataset.word); openWord(button.dataset.word); });
  $$('[data-back-story]').forEach(button => button.onclick = event => { event.stopPropagation(); $('#story').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}
function deleteStoryAt(groupIndex) {
  if (GROUPS.length <= 1) return;
  const group = GROUPS[groupIndex];
  if (!group || !window.confirm(`确定删除“${group.storyTitle}”吗？\n本地学习进度也会一并删除。`)) return;
  const groupId = group.id;
  const currentGroupId = GROUPS[gi].id;
  Object.keys(localStorage).filter(storageKey => storageKey.startsWith(`ieltsau_${groupId}_`)).forEach(storageKey => localStorage.removeItem(storageKey));
  const nextPack = normalizePack({ ...currentPack, groups: GROUPS.filter(group => group.id !== groupId), defaultCompleteGroups: currentPack.defaultCompleteGroups.filter(id => id !== groupId) });
  savePack(nextPack);
  applyPack(nextPack);
  const currentIndex = GROUPS.findIndex(groupItem => groupItem.id === currentGroupId);
  gi = currentIndex >= 0 ? currentIndex : Math.min(groupIndex, GROUPS.length - 1);
  localStorage.setItem('pwaGroup', String(gi));
  storyEditMode = false;
  storyListOpen = false;
  suppressStoryClick = false;
  loadRecall();
  loadQuiz();
  renderAll();
  showScreen('study');
}

function renderStudy() {
  const group = GROUPS[gi];
  const meta = storyMeta(group);
  $('#study').innerHTML = `<div class="card hero"><div class="hero-head"><div><div class="h1">${escapeHtml(meta.title)}</div><div class="english-title">${escapeHtml(meta.englishTitle)}</div></div>${isStoryComplete(group) ? '<span class="story-complete" title="已完成本故事测试">✓</span>' : ''}</div></div><div class="card story" id="story"><div class="story-text">${safeHtml(group.story)}</div></div><h3>词汇详解</h3>${group.words.map((word, index) => { const detail = WORD_DETAILS[word[0]] || word[4] || {}; return `<div class="card wordcard" id="${wordId(word[0])}"><div class="wordhead"><div class="en">${index + 1}. ${escapeHtml(word[0])}</div><div class="zh">${escapeHtml(word[1])}</div></div><div class="hook">${escapeHtml(word[2])}</div><div class="wordextra"><div><b>怎么理解：</b>${escapeHtml(detail.explanation || word[2])}</div><div><b>词源提示：</b>${escapeHtml(WORD_ORIGINS[word[0]] || detail.origin || '后续补充词源提示。')}</div><div><b>常见搭配：</b>${escapeHtml(word[3])}</div><div><b>例句：</b>${escapeHtml(detail.example || '例句待补充。')}</div><button class="back-story" data-back-story>↩ 回到故事</button></div></div>`; }).join('')}`;
  $$('.story b').forEach(element => { const match = element.textContent.trim().match(/^[A-Za-z-]+/); if (match) { element.classList.add('story-word'); element.dataset.word = match[0]; element.title = '点击查看词汇详解'; } });
  bindStudyLinks();
}
function renderRecall() {
  const group = GROUPS[gi];
  const order = recall.listOrder || (recall.listOrder = group.words.map(word => word[0]));
  $('#recall').innerHTML = `<div class="recall-panel" title="可拖动右下角缩放"><div class="recall-panel-head"><div class="recall-toolbar"><button class="recall-tool" id="shuffleRecall">调换顺序</button><button class="recall-tool" id="revealAll">${recallAnswersVisible ? '隐藏答案' : '显示答案'}</button><button class="recall-tool" id="clearRecall">清除全部</button></div><button class="recall-close" id="closeRecall" aria-label="关闭">×</button></div><div class="recall-list">${order.map(word => { const row = group.words.find(item => item[0] === word); const value = recall.answers[0][word] || ''; return `<div class="recall-row"><div class="en">${escapeHtml(word)}</div><input data-recall-word="${escapeHtml(word)}" aria-label="${escapeHtml(word)} 中文意思" value="${escapeHtml(value)}" autocomplete="off"><div class="recall-answer" ${recallAnswersVisible ? '' : 'hidden'}>${escapeHtml(row[1])}</div></div>`; }).join('')}</div></div>`;
  $$('[data-recall-word]').forEach(input => input.oninput = () => { recall.answers[0][input.dataset.recallWord] = input.value; saveRecall(); });
  $('#shuffleRecall').onclick = () => { recall.listOrder = shuffle(order); saveRecall(); renderRecall(); };
  $('#revealAll').onclick = () => { recallAnswersVisible = !recallAnswersVisible; renderRecall(); };
  $('#clearRecall').onclick = () => { recall.answers[0] = {}; saveRecall(); renderRecall(); };
  $('#closeRecall').onclick = () => showScreen('study');
}
function renderQuiz() {
  const group = GROUPS[gi];
  if (quiz.index >= group.quiz.length) { renderStudy(); renderGroups(); $('#quiz').innerHTML = `<div class="card recallbox"><div class="eyebrow">本故事完成 ✓</div><div class="bigword">${quiz.score}/${group.quiz.length}</div><p class="small">${quiz.score === group.quiz.length ? '全对，可以进入下一个故事。' : '重点回看错题，再回到故事中复习。'}</p>${quiz.wrong.length ? `<div style="text-align:left;margin-top:16px">${quiz.wrong.map((item, index) => `<div style="padding:10px 0;border-top:1px solid var(--line)"><b>${index + 1}. ${escapeHtml(item.q)}</b><br><span style="color:var(--bad)">你选：${escapeHtml(item.sel)}</span><br><span style="color:var(--good)">正确：${escapeHtml(item.cor)}</span></div>`).join('')}</div>` : ''}<button class="btn primary" id="redo" style="width:100%;margin-top:14px">重新测试</button></div>`; $('#redo').onclick = () => { quiz = { index: 0, score: 0, wrong: [], locked: false }; saveQuiz(); renderQuiz(); renderGroups(); }; return; }
  const item = group.quiz[quiz.index];
  $('#quiz').innerHTML = `<div class="card"><div class="qnum">第 ${quiz.index + 1}/${group.quiz.length} 题 · 当前 ${quiz.score} 分</div><div class="question">${escapeHtml(item.q)}</div>${item.o.map((option, index) => `<button class="opt" data-option="${index}">${String.fromCharCode(65 + index)}. ${escapeHtml(option)}</button>`).join('')}<div id="feedback" class="feedback"></div><button id="nextQuestion" class="btn primary" style="display:none;width:100%;margin-top:12px">${quiz.index === group.quiz.length - 1 ? '查看结果' : '下一题'}</button></div>`;
  $$('.opt').forEach(button => button.onclick = () => answerQuiz(Number(button.dataset.option)));
  $('#nextQuestion').onclick = () => { quiz.index += 1; quiz.locked = false; saveQuiz(); renderQuiz(); renderGroups(); };
}
function answerQuiz(selected) { if (quiz.locked) return; quiz.locked = true; const item = GROUPS[gi].quiz[quiz.index]; $$('.opt').forEach((button, index) => { button.disabled = true; if (index === item.a) button.classList.add('correct'); if (index === selected && index !== item.a) button.classList.add('wrong'); }); const feedback = $('#feedback'); feedback.classList.add('show'); if (selected === item.a) { quiz.score += 1; feedback.classList.add('good'); feedback.textContent = `✅ 正确。${item.f}`; } else { feedback.classList.add('bad'); feedback.textContent = `❌ ${item.f}`; quiz.wrong.push({ q: item.q, sel: item.o[selected], cor: item.o[item.a] }); } $('#nextQuestion').style.display = 'block'; saveQuiz(); }

function wordSeaButton(item, groupIndex) { return `<button class="wordsea-chip" data-wordsea-word="${escapeHtml(item.word)}" data-group-index="${groupIndex}" title="单击看中文，双击跳到故事"><span class="sea-word">${escapeHtml(item.word)}</span><span class="sea-meaning">${escapeHtml(item.meaning)}</span></button>`; }
function bindWordSea() { $$('[data-wordsea-word]').forEach(button => { button.onclick = () => { button.classList.add('flipped'); clearTimeout(wordSeaFlipTimers.get(button)); wordSeaFlipTimers.set(button, setTimeout(() => { button.classList.remove('flipped'); wordSeaFlipTimers.delete(button); }, 2000)); }; button.ondblclick = () => { gi = Number(button.dataset.groupIndex); localStorage.setItem('pwaGroup', String(gi)); loadRecall(); loadQuiz(); renderGroups(); showScreen('study'); requestAnimationFrame(() => openWord(button.dataset.wordseaWord)); }; }); }
function packManagerHtml() { const pendingText = pendingPack ? `<div class="pack-pending">已读取：${escapeHtml(pendingPack.title)} · ${pendingPack.groups.length} 组故事 · ${pendingPack.groups.reduce((sum, group) => sum + group.words.length, 0)} 个词</div>` : ''; return `<div class="card pack-card"><div class="pack-head"><div><div class="eyebrow">数据包</div><h2>导入你的故事</h2><div class="pack-help">让 AI 生成 JSON 文件，在这里导入；学习进度保存在当前浏览器。</div></div><span class="pack-count">${GROUPS.length} 组</span></div><div class="pack-actions"><label class="btn secondary" for="packFile">选择 JSON</label><button class="btn secondary" id="exportPack">导出备份</button><input id="packFile" type="file" accept=".json,application/json" hidden></div>${pendingText}<div class="pack-choice"><button class="btn primary" id="mergePack" ${pendingPack ? '' : 'disabled'}>合并导入</button><button class="btn secondary" id="replacePack" ${pendingPack ? '' : 'disabled'}>替换当前数据</button></div><button class="btn secondary" id="restoreSample" style="width:100%;margin-top:8px">恢复公开示例</button><div id="packMessage" class="pack-message" aria-live="polite"></div></div>`; }
function showPackMessage(text, bad = false) { const message = $('#packMessage'); if (!message) return; message.textContent = text; message.classList.toggle('bad', bad); }
function finishPackChange(nextPack, clearProgress) { if (clearProgress) clearLearningProgress(); savePack(nextPack); applyPack(nextPack); gi = 0; loadRecall(); loadQuiz(); pendingPack = null; renderAll(); showScreen('progress'); }
function bindPackManager() {
  $('#packFile').onchange = async event => { const file = event.target.files[0]; if (!file) return; try { pendingPack = normalizePack(JSON.parse(await file.text())); renderProgress(); showPackMessage(`已读取 ${file.name}，请选择合并或替换。`); } catch (error) { pendingPack = null; renderProgress(); showPackMessage(error.message || 'JSON 文件无法读取。', true); } };
  $('#exportPack').onclick = () => { const blob = new Blob([JSON.stringify({ ...currentPack, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'my-story-vocab-pack.json'; link.click(); URL.revokeObjectURL(link.href); showPackMessage('已导出当前词汇包。'); };
  $('#mergePack').onclick = () => { if (pendingPack) finishPackChange(mergePacks(currentPack, pendingPack), false); };
  $('#replacePack').onclick = () => { if (pendingPack) finishPackChange(pendingPack, true); };
  $('#restoreSample').onclick = () => finishPackChange(SAMPLE_PACK, true);
}
function renderProgress() {
  wordSeaFlipTimers.forEach(timer => clearTimeout(timer)); wordSeaFlipTimers.clear();
  const finished = GROUPS.flatMap((group, groupIndex) => isStoryComplete(group) ? group.words.map(word => ({ word: word[0], meaning: word[1], groupIndex })) : []);
  const unfinished = GROUPS.flatMap((group, groupIndex) => !isStoryComplete(group) ? group.words.map(word => ({ word: word[0], meaning: word[1], groupIndex })) : []);
  $('#progress').innerHTML = `${packManagerHtml()}<div class="card wordsea-card"><h2>词海</h2><p class="wordsea-tip">单击词卡查看中文意思，2 秒后自动翻回英文；双击已有故事词，跳回它所在的故事。</p><div class="wordsea-section"><h3>我学完的故事词</h3><div class="wordsea-grid">${finished.map(item => wordSeaButton(item, item.groupIndex)).join('') || '<p class="wordsea-tip">还没有完成测试的故事。</p>'}</div></div><div class="wordsea-section"><h3>已有故事词，尚未学完</h3><div class="wordsea-grid">${unfinished.map(item => wordSeaButton(item, item.groupIndex)).join('') || '<p class="wordsea-tip">所有已有故事词都已学完。</p>'}</div></div><div class="wordsea-section"><h3>来自你的生词</h3><p class="wordsea-tip">这些词还没有放入故事，先作为下一批候选。</p><div class="wordsea-grid">${candidatePool.map(item => `<button class="wordsea-chip pending" title="单击看中文"><span class="sea-word">${escapeHtml(item.word)}</span><span class="sea-meaning">${escapeHtml(item.meaning)}</span></button>`).join('')}</div></div></div>`;
  bindWordSea();
  $$('.wordsea-chip.pending').forEach(button => button.onclick = () => { button.classList.add('flipped'); clearTimeout(wordSeaFlipTimers.get(button)); wordSeaFlipTimers.set(button, setTimeout(() => button.classList.remove('flipped'), 2000)); });
  bindPackManager();
}
function renderAll() { renderGroups(); renderStudy(); renderRecall(); renderQuiz(); renderProgress(); }

window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredPrompt = event; $('#installBox').classList.add('show'); });
$('#installBtn').onclick = async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $('#installBox').classList.remove('show'); };
window.addEventListener('appinstalled', () => $('#installBox').classList.remove('show'));

$('#speechToggle').onclick = toggleSpeech;
renderSpeechToggle();
localStorage.setItem('pwaGroup', String(gi));
loadRecall(); loadQuiz(); renderAll(); showScreen(screen);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
