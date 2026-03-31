
const API = "https://egg-game-api.onrender.com/api";

const state = {
  token: null,
  user: null,
  mode: "quiz",
  createType: "question",
  currentItem: null,
  selectedPlayerId: null,
  players: [],
  users: [],
  archive: [],
  stats: { questions: 0, challenges: 0, events: 0, players: 0 }
};

const $ = id => document.getElementById(id);
const refs = {
  showAdminLoginBtn: $("showAdminLoginBtn"),
  showSubscriberLoginBtn: $("showSubscriberLoginBtn"),
  showMemberLoginBtn: $("showMemberLoginBtn"),
  logoutBtn: $("logoutBtn"),
  authMessage: $("authMessage"),
  adminLoginCard: $("adminLoginCard"),
  subscriberLoginCard: $("subscriberLoginCard"),
  memberLoginCard: $("memberLoginCard"),
  memberRegisterCard: $("memberRegisterCard"),
  adminUsername: $("adminUsername"),
  adminPassword: $("adminPassword"),
  subscriberUsername: $("subscriberUsername"),
  subscriberPassword: $("subscriberPassword"),
  memberUsername: $("memberUsername"),
  memberPassword: $("memberPassword"),
  registerName: $("registerName"),
  registerUsername: $("registerUsername"),
  registerPassword: $("registerPassword"),
  registerEmoji: $("registerEmoji"),
  adminLoginBtn: $("adminLoginBtn"),
  subscriberLoginBtn: $("subscriberLoginBtn"),
  memberLoginBtn: $("memberLoginBtn"),
  showRegisterBtn: $("showRegisterBtn"),
  registerBtn: $("registerBtn"),
  dashboard: $("dashboard"),
  playerName: $("playerName"),
  playerEmoji: $("playerEmoji"),
  addPlayerBtn: $("addPlayerBtn"),
  playersList: $("playersList"),
  randomPlayerBtn: $("randomPlayerBtn"),
  nextRoundBtn: $("nextRoundBtn"),
  exportArchiveBtn: $("exportArchiveBtn"),
  contentCard: $("contentCard"),
  bulkUploadCard: $("bulkUploadCard"),
  userManagerCard: $("userManagerCard"),
  bulkFileInput: $("bulkFileInput"),
  bulkUploadBtn: $("bulkUploadBtn"),
  bulkUploadResult: $("bulkUploadResult"),
  modeTabs: [...document.querySelectorAll(".mode-tab")],
  createTabs: [...document.querySelectorAll(".create-tab")],
  newItemBtn: $("newItemBtn"),
  revealAnswerBtn: $("revealAnswerBtn"),
  awardBtn: $("awardBtn"),
  headline: $("headline"),
  bodyText: $("bodyText"),
  answerBox: $("answerBox"),
  roundChip: $("roundChip"),
  categoryChip: $("categoryChip"),
  typeChip: $("typeChip"),
  podium: $("podium"),
  accountInfo: $("accountInfo"),
  refreshArchiveBtn: $("refreshArchiveBtn"),
  archiveList: $("archiveList"),
  contentCategory: $("contentCategory"),
  contentMeta: $("contentMeta"),
  contentText: $("contentText"),
  saveContentBtn: $("saveContentBtn"),
  newUserDisplayName: $("newUserDisplayName"),
  newUserUsername: $("newUserUsername"),
  newUserPassword: $("newUserPassword"),
  newUserRole: $("newUserRole"),
  createUserBtn: $("createUserBtn"),
  usersList: $("usersList"),
  permissionUserSelect: $("permissionUserSelect"),
  permManageGame: $("permManageGame"),
  permManageContent: $("permManageContent"),
  permManageUsers: $("permManageUsers"),
  permExportImport: $("permExportImport"),
  savePermissionsBtn: $("savePermissionsBtn"),
  statQuestions: $("statQuestions"),
  statChallenges: $("statChallenges"),
  statEvents: $("statEvents"),
  statPlayers: $("statPlayers")
};

function setMessage(text){ refs.authMessage.textContent = text; }
function hideAllAuthCards(){
  [refs.adminLoginCard, refs.subscriberLoginCard, refs.memberLoginCard, refs.memberRegisterCard].forEach(x => x.classList.add("hidden"));
}
function showCard(card, text){
  hideAllAuthCards();
  card.classList.remove("hidden");
  setMessage(text);
}

function setStoredAuth(token, user){
  localStorage.setItem("egg_token", token);
  localStorage.setItem("egg_user", JSON.stringify(user));
  state.token = token;
  state.user = user;
}
function loadStoredAuth(){
  const token = localStorage.getItem("egg_token");
  const user = localStorage.getItem("egg_user");
  if(token && user){
    state.token = token;
    state.user = JSON.parse(user);
  }
}
function clearStoredAuth(){
  localStorage.removeItem("egg_token");
  localStorage.removeItem("egg_user");
  state.token = null;
  state.user = null;
}

async function api(path, options = {}){
  const headers = Object.assign({}, options.headers || {});
  if(!(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  if(state.token) headers["Authorization"] = `Bearer ${state.token}`;
  const res = await fetch(API + path, { ...options, headers });
  const data = await res.json();
  if(!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function hasPerm(key){
  if(!state.user) return false;
  if(state.user.role === "admin") return true;
  return !!state.user.permissions?.[key];
}

function updateAuthUI(){
  const logged = !!state.user;
  refs.logoutBtn.classList.toggle("hidden", !logged);
  refs.dashboard.classList.toggle("hidden", !logged);
  refs.showAdminLoginBtn.classList.toggle("hidden", logged);
  refs.showSubscriberLoginBtn.classList.toggle("hidden", logged);
  refs.showMemberLoginBtn.classList.toggle("hidden", logged);
  hideAllAuthCards();
  refs.contentCard.classList.toggle("hidden", !hasPerm("manageContent"));
  refs.bulkUploadCard.classList.toggle("hidden", !hasPerm("manageContent"));
  refs.userManagerCard.classList.toggle("hidden", !hasPerm("manageUsers"));
  refs.accountInfo.textContent = logged ? `${state.user.displayName || state.user.username} — ${state.user.role}` : "لا يوجد تسجيل دخول.";
  if(!logged) setMessage("اختر نوع الحساب للدخول أو أنشئ حساب عضو جديد.");
}

async function login(scope, username, password){
  const data = await api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ scope, username, password })
  });
  setStoredAuth(data.token, data.user);
  updateAuthUI();
  await refreshAll();
}

async function registerMember(){
  const data = await api("/auth/register-member", {
    method: "POST",
    body: JSON.stringify({
      displayName: refs.registerName.value.trim(),
      username: refs.registerUsername.value.trim(),
      password: refs.registerPassword.value.trim(),
      emoji: refs.registerEmoji.value.trim() || "🎮"
    })
  });
  alert(data.message || "تم إنشاء الحساب");
  refs.registerName.value = "";
  refs.registerUsername.value = "";
  refs.registerPassword.value = "";
  refs.registerEmoji.value = "";
  showCard(refs.memberLoginCard, "تم إنشاء الحساب. يمكنك الدخول الآن.");
}

async function refreshStats(){
  const data = await api("/content/stats");
  state.stats = data;
  refs.statQuestions.textContent = data.questions;
  refs.statChallenges.textContent = data.challenges;
  refs.statEvents.textContent = data.events;
  refs.statPlayers.textContent = state.players.length;
}

async function refreshGame(){
  const data = await api("/game/state");
  refs.roundChip.textContent = `الجولة: ${data.game.round}`;
  state.players = data.game.players || [];
  renderPlayers();
  renderPodium();
  refs.statPlayers.textContent = state.players.length;
}

async function refreshArchive(){
  const data = await api("/archive/my");
  state.archive = data.games || [];
  refs.archiveList.innerHTML = state.archive.length ? state.archive.map(g => `
    <div class="archive-card">
      <strong>${new Date(g.startedAt).toLocaleString("ar-SA")}</strong>
      <div>عدد السجلات: ${g.rounds.length}</div>
      <div>آخر تحديث: ${new Date(g.updatedAt).toLocaleString("ar-SA")}</div>
    </div>
  `).join("") : '<div class="muted">لا يوجد سجل سابق.</div>';
}

async function refreshUsers(){
  if(!hasPerm("manageUsers")) return;
  const data = await api("/users");
  state.users = data.users || [];
  refs.usersList.innerHTML = state.users.map(u => `
    <div class="user-card">
      <strong>${u.displayName || u.username}</strong>
      <div>${u.username} — ${u.role}</div>
    </div>
  `).join("");
  const supervisors = state.users.filter(u => u.role === "supervisor");
  refs.permissionUserSelect.innerHTML = supervisors.length ? supervisors.map(u => `<option value="${u.id}">${u.displayName || u.username}</option>`).join("") : '<option value="">لا يوجد مشرفون</option>';
}

async function refreshAll(){
  await refreshGame();
  await refreshStats();
  await refreshArchive();
  await refreshUsers();
}

function renderPlayers(){
  refs.playersList.innerHTML = state.players.length ? state.players.map(p => `
    <div class="player-card">
      <strong>${p.emoji || "🎤"} ${p.name}</strong>
      <div>${p.score} نقطة</div>
      <div class="card-actions">
        <button class="btn secondary" onclick="selectPlayer('${p.id}')">تحديد</button>
        <button class="btn success" onclick="changeScore('${p.id}',1)">+1</button>
        <button class="btn success" onclick="changeScore('${p.id}',3)">+3</button>
        <button class="btn danger" onclick="changeScore('${p.id}',-1)">-1</button>
      </div>
    </div>
  `).join("") : '<div class="muted">لا يوجد متسابقون بعد.</div>';
}

function renderPodium(){
  const sorted = [...state.players].sort((a,b) => b.score - a.score).slice(0,6);
  refs.podium.innerHTML = sorted.length ? sorted.map((p, i) => `
    <div class="result-card">${i + 1}. ${p.emoji || "🎤"} ${p.name}<br>${p.score} نقطة</div>
  `).join("") : '<div class="muted">لا توجد نتائج بعد.</div>';
}

async function addPlayer(){
  if(!hasPerm("manageGame")) return alert("لا تملك صلاحية إدارة اللعبة");
  await api("/game/players", {
    method: "POST",
    body: JSON.stringify({ name: refs.playerName.value.trim(), emoji: refs.playerEmoji.value.trim() || "🎤" })
  });
  refs.playerName.value = "";
  refs.playerEmoji.value = "";
  await refreshGame();
}

window.selectPlayer = function(id){ state.selectedPlayerId = id; }
window.changeScore = async function(id, delta){
  if(!hasPerm("manageGame")) return alert("لا تملك صلاحية إدارة اللعبة");
  await api("/game/score", {
    method: "POST",
    body: JSON.stringify({ playerId: id, delta })
  });
  await refreshGame();
  await refreshArchive();
}

async function nextRound(){
  if(!hasPerm("manageGame")) return alert("لا تملك صلاحية إدارة اللعبة");
  await api("/game/next-round", { method: "POST" });
  await refreshAll();
}

async function pickRandomPlayer(){
  if(!state.players.length) return alert("لا يوجد متسابقون");
  const chosen = state.players[Math.floor(Math.random() * state.players.length)];
  state.selectedPlayerId = chosen.id;
  alert(`تم اختيار ${chosen.emoji || "🎤"} ${chosen.name}`);
}

async function awardDefault(){
  if(!state.selectedPlayerId) return alert("حدد متسابقًا أولًا");
  await window.changeScore(state.selectedPlayerId, 3);
}

async function loadRandomItem(){
  const data = await api(`/content/random?type=${state.mode}`);
  state.currentItem = data.item;
  refs.answerBox.classList.add("hidden");
  if(!state.currentItem){
    refs.headline.textContent = "لا يوجد محتوى متاح";
    refs.bodyText.textContent = "";
    refs.categoryChip.textContent = "التصنيف: —";
    refs.typeChip.textContent = "النوع: —";
    return;
  }
  if(state.mode === "quiz"){
    refs.headline.textContent = state.currentItem.question;
    refs.bodyText.textContent = state.currentItem.options?.length ? "الخيارات: " + state.currentItem.options.join(" — ") : "سؤال مباشر";
    refs.categoryChip.textContent = `التصنيف: ${state.currentItem.category || "عام"}`;
    refs.typeChip.textContent = `النوع: ${state.currentItem.type || "سؤال"}`;
  } else if(state.mode === "challenge"){
    refs.headline.textContent = state.currentItem.text;
    refs.bodyText.textContent = state.currentItem.rule || "تحدي";
    refs.categoryChip.textContent = `التصنيف: ${state.currentItem.category || "عام"}`;
    refs.typeChip.textContent = "النوع: تحدي";
  } else {
    refs.headline.textContent = state.currentItem.text;
    refs.bodyText.textContent = "فعالية جاهزة للتنفيذ";
    refs.categoryChip.textContent = `التصنيف: ${state.currentItem.category || "عام"}`;
    refs.typeChip.textContent = `النوع: ${state.currentItem.emoji || "🎉"} فعالية`;
  }
}

function revealAnswer(){
  if(state.mode !== "quiz" || !state.currentItem) return;
  refs.answerBox.textContent = `الإجابة الصحيحة: ${state.currentItem.answer}`;
  refs.answerBox.classList.remove("hidden");
}

async function saveContent(){
  if(!hasPerm("manageContent")) return alert("لا تملك صلاحية إدارة المحتوى");
  await api("/content", {
    method: "POST",
    body: JSON.stringify({
      type: state.createType,
      category: refs.contentCategory.value.trim(),
      meta: refs.contentMeta.value.trim(),
      text: refs.contentText.value.trim()
    })
  });
  refs.contentCategory.value = "";
  refs.contentMeta.value = "";
  refs.contentText.value = "";
  await refreshStats();
  alert("تم الحفظ");
}

async function uploadBulkQuestions(){
  if(!hasPerm("manageContent")) return alert("لا تملك صلاحية إدارة المحتوى");
  const file = refs.bulkFileInput.files[0];
  if(!file) return alert("اختر ملفًا أولًا");
  const fd = new FormData();
  fd.append("file", file);
  const data = await api("/content/bulk-upload", { method: "POST", body: fd });
  refs.bulkUploadResult.textContent = `تمت إضافة ${data.added} سؤال`;
  refs.bulkFileInput.value = "";
  await refreshStats();
}

async function createUser(){
  if(!hasPerm("manageUsers")) return alert("لا تملك صلاحية إدارة الحسابات");
  await api("/users", {
    method: "POST",
    body: JSON.stringify({
      displayName: refs.newUserDisplayName.value.trim(),
      username: refs.newUserUsername.value.trim(),
      password: refs.newUserPassword.value.trim(),
      role: refs.newUserRole.value
    })
  });
  refs.newUserDisplayName.value = "";
  refs.newUserUsername.value = "";
  refs.newUserPassword.value = "";
  await refreshUsers();
  alert("تم إنشاء الحساب");
}

async function savePermissions(){
  const id = refs.permissionUserSelect.value;
  if(!id) return alert("اختر مشرفًا");
  await api(`/users/${id}/permissions`, {
    method: "PUT",
    body: JSON.stringify({
      permissions: {
        manageGame: refs.permManageGame.checked,
        manageContent: refs.permManageContent.checked,
        manageUsers: refs.permManageUsers.checked,
        exportImport: refs.permExportImport.checked
      }
    })
  });
  alert("تم حفظ الصلاحيات");
  await refreshUsers();
}

async function exportArchive(){
  const data = await api("/archive/my");
  const blob = new Blob([JSON.stringify(data.games || [], null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "my-game-archive.json";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 200);
}

function bind(){
  refs.showAdminLoginBtn.addEventListener("click", () => showCard(refs.adminLoginCard, "أدخل بيانات الإدارة."));
  refs.showSubscriberLoginBtn.addEventListener("click", () => showCard(refs.subscriberLoginCard, "أدخل بيانات المشترك."));
  refs.showMemberLoginBtn.addEventListener("click", () => showCard(refs.memberLoginCard, "أدخل بيانات العضو أو أنشئ حسابًا جديدًا."));
  refs.showRegisterBtn.addEventListener("click", () => showCard(refs.memberRegisterCard, "أدخل بيانات العضو الجديد."));
  refs.adminLoginBtn.addEventListener("click", () => login("admin", refs.adminUsername.value.trim(), refs.adminPassword.value));
  refs.subscriberLoginBtn.addEventListener("click", () => login("subscriber", refs.subscriberUsername.value.trim(), refs.subscriberPassword.value));
  refs.memberLoginBtn.addEventListener("click", () => login("member", refs.memberUsername.value.trim(), refs.memberPassword.value));
  refs.registerBtn.addEventListener("click", registerMember);
  refs.logoutBtn.addEventListener("click", () => { clearStoredAuth(); updateAuthUI(); });
  refs.addPlayerBtn.addEventListener("click", addPlayer);
  refs.randomPlayerBtn.addEventListener("click", pickRandomPlayer);
  refs.nextRoundBtn.addEventListener("click", nextRound);
  refs.exportArchiveBtn.addEventListener("click", exportArchive);
  refs.newItemBtn.addEventListener("click", loadRandomItem);
  refs.revealAnswerBtn.addEventListener("click", revealAnswer);
  refs.awardBtn.addEventListener("click", awardDefault);
  refs.saveContentBtn.addEventListener("click", saveContent);
  refs.bulkUploadBtn.addEventListener("click", uploadBulkQuestions);
  refs.createUserBtn.addEventListener("click", createUser);
  refs.savePermissionsBtn.addEventListener("click", savePermissions);
  refs.refreshArchiveBtn.addEventListener("click", refreshArchive);

  refs.modeTabs.forEach(btn => btn.addEventListener("click", () => {
    refs.modeTabs.forEach(x => x.classList.remove("active"));
    btn.classList.add("active");
    state.mode = btn.dataset.mode;
  }));

  refs.createTabs.forEach(btn => btn.addEventListener("click", () => {
    refs.createTabs.forEach(x => x.classList.remove("active"));
    btn.classList.add("active");
    state.createType = btn.dataset.create;
  }));
}

async function init(){
  bind();
  loadStoredAuth();
  updateAuthUI();
  if(state.user){
    try {
      await refreshAll();
    } catch (e) {
      clearStoredAuth();
      updateAuthUI();
    }
  }
}
init();
