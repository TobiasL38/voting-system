// script.js - unified frontend logic (User + Admin)
const API_BASE = 'api.php';
let currentAdminLogged = false;

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3500);
}

async function apiCall(action, method = 'GET', data = null, queryParams = null) {
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    let url = `${API_BASE}?action=${action}`;
    if (queryParams) {
        const params = new URLSearchParams(queryParams);
        url += `&${params.toString()}`;
    }
    if (data && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
        options.body = JSON.stringify(data);
    }
    try {
        const resp = await fetch(url, options);
        const json = await resp.json();
        if (!resp.ok || (json && json.error)) throw new Error(json.error || `HTTP ${resp.status}`);
        return json;
    } catch (err) {
        showToast(err.message, 'error');
        throw err;
    }
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        if (file.size > 5 * 1024 * 1024) reject(new Error('Image under 5MB required'));
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function avatarPlaceholder(name) {
    const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' rx='60' fill='%232563eb'/%3E%3Ctext x='60' y='68' text-anchor='middle' font-size='42' font-weight='700' font-family='Inter,sans-serif' fill='white'%3E${encodeURIComponent(initials)}%3C/text%3E%3C/svg%3E`;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function(m) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return map[m];
    });
}

// ============= USER VOTING MODULE =============
async function loadUserContenders() {
    try {
        const contenders = await apiCall('get_contenders');
        const container = document.getElementById('contendersList');
        if (!contenders.length) {
            container.innerHTML = '<div class="placeholder-text">No contenders available.</div>';
            return;
        }
        container.innerHTML = contenders.map(c => `
            <label class="candidate-card" data-id="${c.id}">
                <input type="radio" name="contender" value="${c.id}" class="radio-custom">
                <img class="candidate-photo" src="${c.photo || avatarPlaceholder(c.name)}" alt="${escapeHtml(c.name)}" onerror="this.src='${avatarPlaceholder(c.name)}'">
                <div class="candidate-info">
                    <h4>${escapeHtml(c.name)}</h4>
                    <p>${escapeHtml(c.description || 'Making a difference')}</p>
                </div>
            </label>
        `).join('');
    } catch(e) { console.error(e); }
}

async function submitVote(contenderId) {
    try {
        // No need to send county; backend uses active county from settings
        const result = await apiCall('vote', 'POST', { contender_id: contenderId });
        if (result.success) {
            showToast(result.message || "Vote recorded successfully!", "success");
            document.getElementById('voteStatusMessage').innerHTML = '<span style="color:#10b981;">✔️ ' + result.message + '</span>';
            document.querySelectorAll('input[name="contender"]').forEach(r => r.disabled = true);
            const submitBtn = document.getElementById('submitVoteBtn');
            if(submitBtn) submitBtn.disabled = true;
            await displayLiveResults();
        } else {
            showToast(result.error || "Vote failed", "error");
        }
    } catch(e) { }
}

async function displayLiveResults() {
    try {
        const results = await apiCall('get_results');
        const container = document.getElementById('liveResultsContainer');
        if (!results || results.length === 0) {
            container.innerHTML = '<div class="placeholder-text">No votes yet. Be the first!</div>';
            return;
        }
        const total = results[0]?.total_votes || 0;
        let html = `<div style="margin-bottom: 1rem;"><strong>🗳️ Total Votes: ${total}</strong></div>`;
        results.forEach(r => {
            const percent = r.percentage || 0;
            const photo = r.photo || avatarPlaceholder(r.name);
            html += `
                <div class="result-row">
                    <div class="result-header">
                        <span class="result-candidate">
                            <img class="result-avatar" src="${photo}" alt="${escapeHtml(r.name)}" onerror="this.src='${avatarPlaceholder(r.name)}'">
                            ${escapeHtml(r.name)}
                        </span>
                        <span>${r.votes} votes (${percent.toFixed(1)}%)</span>
                    </div>
                    <div class="progress-bar-bg"><div class="progress-fill" style="width: ${percent}%;"></div></div>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch(e) { console.error(e); }
}

function initUserInterface() {
    loadUserContenders();
    displayLiveResults();

    const voteForm = document.getElementById('voteForm');
    if(voteForm) {
        voteForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const selected = document.querySelector('input[name="contender"]:checked');
            if(!selected) { showToast("Please select a candidate first!", "error"); return; }
            await submitVote(selected.value);
        });
    }
    const viewResultsBtn = document.getElementById('viewResultsBtn');
    if(viewResultsBtn) viewResultsBtn.addEventListener('click', async () => {
        await displayLiveResults();
        showToast("Results refreshed", "info");
    });
}

// ============= ADMIN MODULE =============
let pendingAddPhoto = null;
let pendingEditPhoto = undefined;

async function adminLogin(username, password) {
    try {
        const res = await apiCall('admin_login', 'POST', { username, password });
        if(res.success) {
            currentAdminLogged = true;
            showToast("Admin login successful", "success");
            document.getElementById('adminLoginSection').style.display = 'none';
            document.getElementById('adminDashboard').style.display = 'block';
            document.getElementById('adminLogoutBtn').style.display = 'block';
            loadAdminCounties();
            loadAdminContenders();
            loadAdminResults();
            loadCurrentActiveCounty();
        } else {
            showToast(res.error || "Invalid credentials", "error");
        }
    } catch(e) { showToast("Login failed", "error"); }
}

async function adminLogout() {
    try {
        await apiCall('admin_logout', 'POST');
        currentAdminLogged = false;
        document.getElementById('adminLoginSection').style.display = 'flex';
        document.getElementById('adminDashboard').style.display = 'none';
        document.getElementById('adminLogoutBtn').style.display = 'none';
        showToast("Logged out", "info");
    } catch(e) {}
}

async function loadAdminCounties() {
    try {
        const counties = await apiCall('get_counties');
        const activeSelect = document.getElementById('activeCountySelect');
        const filterSelect = document.getElementById('adminCountyFilter');
        if (!activeSelect) return;
        
        activeSelect.innerHTML = '';
        filterSelect.innerHTML = '<option value="all">🇰🇪 All Counties (National)</option>';
        
        counties.forEach(county => {
            activeSelect.innerHTML += `<option value="${county}">📍 ${county}</option>`;
            filterSelect.innerHTML += `<option value="${county}">📍 ${county}</option>`;
        });
    } catch(e) { console.error(e); }
}

async function loadCurrentActiveCounty() {
    try {
        const res = await apiCall('get_active_county');
        const displayDiv = document.getElementById('currentActiveCountyDisplay');
        if (displayDiv) {
            displayDiv.innerHTML = `🔴 Currently active: <strong>${res.county}</strong>`;
        }
    } catch(e) { console.error(e); }
}

async function setActiveCounty(county) {
    try {
        const res = await apiCall('set_active_county', 'POST', { county });
        if (res.success) {
            showToast(`Active county set to ${res.county}`, "success");
            loadCurrentActiveCounty();
        }
    } catch(e) { showToast("Failed to set active county", "error"); }
}

async function loadAdminContenders() {
    try {
        const contenders = await apiCall('get_contenders');
        const container = document.getElementById('contendersAdminList');
        if(!contenders.length){ container.innerHTML = '<div class="placeholder-text">No contenders. Add one!</div>'; return; }
        container.innerHTML = contenders.map(c => `
            <div class="admin-contender-item" data-id="${c.id}">
                <img class="admin-candidate-thumb" src="${c.photo || avatarPlaceholder(c.name)}" alt="${escapeHtml(c.name)}" onerror="this.src='${avatarPlaceholder(c.name)}'">
                <div class="contender-info">
                    <strong>${escapeHtml(c.name)}</strong>
                    <small>${escapeHtml(c.description || 'No description')}</small>
                </div>
                <div class="admin-buttons">
                    <button class="btn edit-contender-btn" 
                        data-id="${c.id}" 
                        data-name="${escapeHtml(c.name)}" 
                        data-desc="${escapeHtml(c.description || '')}"
                        data-photo="${c.photo ? 'has_photo' : ''}">✏️ Edit</button>
                    <button class="btn btn-danger delete-contender-btn" data-id="${c.id}">🗑️ Delete</button>
                </div>
            </div>
        `).join('');
        
        const photoMap = {};
        contenders.forEach(c => { photoMap[c.id] = c.photo || null; });
        
        document.querySelectorAll('.edit-contender-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                const oldName = btn.dataset.name;
                const oldDesc = btn.dataset.desc;
                const existingPhoto = photoMap[id];
                openEditModal(id, oldName, oldDesc, existingPhoto);
            });
        });
        document.querySelectorAll('.delete-contender-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if(confirm("Delete this contender? All votes will be removed.")){
                    await apiCall('delete_contender', 'POST', { id: btn.dataset.id });
                    showToast("Contender deleted", "info");
                    loadAdminContenders();
                    loadAdminResults();
                    if(document.getElementById('contendersList')) loadUserContenders();
                }
            });
        });
    } catch(e) {}
}

function openEditModal(id, name, desc, existingPhoto) {
    pendingEditPhoto = undefined;
    document.getElementById('editModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'editModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-card glass-card">
            <h3>✏️ Edit Contender</h3>
            <div class="input-group">
                <label>Name</label>
                <input type="text" id="editName" class="form-input" value="${escapeHtml(name)}" required>
            </div>
            <div class="input-group">
                <label>Description / Slogan</label>
                <input type="text" id="editDesc" class="form-input" value="${escapeHtml(desc)}">
            </div>
            <div class="input-group">
                <label>Photo</label>
                <div class="photo-upload-area" id="editPhotoArea">
                    <img id="editPhotoPreview" src="${existingPhoto || avatarPlaceholder(name)}" alt="Preview" class="photo-preview-lg">
                    <div class="photo-upload-controls">
                        <label class="btn btn-secondary photo-upload-label" for="editPhotoInput">📷 Change Photo</label>
                        <input type="file" id="editPhotoInput" accept="image/jpeg,image/png,image/webp,image/gif" style="display:none">
                        ${existingPhoto ? `<button class="btn btn-danger" id="removePhotoBtn" style="padding:0.5rem 1rem;">🗑️ Remove Photo</button>` : ''}
                    </div>
                    <p class="photo-hint">Max 5MB · JPG, PNG, WebP, GIF</p>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-primary" id="saveEditBtn">💾 Save Changes</button>
                <button class="btn" id="cancelEditBtn">Cancel</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('editPhotoInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const base64 = await readFileAsBase64(file);
            pendingEditPhoto = base64;
            document.getElementById('editPhotoPreview').src = base64;
            showToast('Photo selected', 'info');
        } catch(err) {
            showToast(err.message, 'error');
        }
    });

    document.getElementById('removePhotoBtn')?.addEventListener('click', () => {
        pendingEditPhoto = '';
        document.getElementById('editPhotoPreview').src = avatarPlaceholder(name);
        showToast('Photo will be removed on save', 'info');
    });

    document.getElementById('saveEditBtn').addEventListener('click', async () => {
        const newName = document.getElementById('editName').value.trim();
        const newDesc = document.getElementById('editDesc').value.trim();
        if (!newName) { showToast('Name is required', 'error'); return; }
        
        const payload = { id, name: newName, description: newDesc };
        if (pendingEditPhoto !== undefined) {
            payload.photo = pendingEditPhoto;
        }
        try {
            await apiCall('edit_contender', 'POST', payload);
            showToast('Contender updated', 'success');
            modal.remove();
            loadAdminContenders();
            loadAdminResults();
            if(document.getElementById('contendersList')) loadUserContenders();
        } catch(e) {}
    });

    document.getElementById('cancelEditBtn').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if(e.target === modal) modal.remove(); });
}

async function loadAdminResults() {
    const countySelect = document.getElementById('adminCountyFilter');
    const county = countySelect ? countySelect.value : 'all';
    try {
        const results = await apiCall('get_results', 'GET', null, { county });
        const container = document.getElementById('adminResultsContainer');
        if (!results || results.length === 0) {
            container.innerHTML = '<div class="placeholder-text">No votes recorded yet</div>';
            return;
        }
        const total = results[0]?.total_votes || 0;
        const countyLabel = county === 'all' ? 'KENYA' : county.toUpperCase();
        let html = `<div class="total-votes">📊 TOTAL VOTES IN ${countyLabel}: <strong>${total}</strong></div>`;
        results.forEach(r => {
            const percent = r.percentage || 0;
            const photo = r.photo || avatarPlaceholder(r.name);
            html += `
                <div class="result-row-admin">
                    <div class="result-header">
                        <span class="result-candidate">
                            <img class="result-avatar" src="${photo}" alt="${escapeHtml(r.name)}" onerror="this.src='${avatarPlaceholder(r.name)}'">
                            🏷️ ${escapeHtml(r.name)}
                        </span>
                        <span class="stat-numbers">${r.votes} votes (${percent.toFixed(1)}%)</span>
                    </div>
                    <div class="progress-bar-bg"><div class="progress-fill" style="width: ${percent}%; background:#2563eb;"></div></div>
                </div>
            `;
        });
        container.innerHTML = html;
    } catch(e) { console.error(e); }
}

function initAdminEvents() {
    const loginForm = document.getElementById('adminLoginForm');
    if(loginForm){
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = document.getElementById('adminUsername').value;
            const pass = document.getElementById('adminPassword').value;
            await adminLogin(user, pass);
        });
    }
    const logoutBtn = document.getElementById('adminLogoutBtn');
    if(logoutBtn) logoutBtn.addEventListener('click', () => adminLogout());

    const addPhotoInput = document.getElementById('addPhotoInput');
    const addPhotoPreview = document.getElementById('addPhotoPreview');
    if (addPhotoInput) {
        addPhotoInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                pendingAddPhoto = await readFileAsBase64(file);
                addPhotoPreview.src = pendingAddPhoto;
                addPhotoPreview.style.display = 'block';
                showToast('Photo selected', 'info');
            } catch(err) {
                showToast(err.message, 'error');
            }
        });
    }
    const clearPhotoBtn = document.getElementById('clearAddPhotoBtn');
    if (clearPhotoBtn) {
        clearPhotoBtn.addEventListener('click', () => {
            pendingAddPhoto = null;
            if (addPhotoPreview) { addPhotoPreview.src = ''; addPhotoPreview.style.display = 'none'; }
            if (addPhotoInput) addPhotoInput.value = '';
            showToast('Photo cleared', 'info');
        });
    }

    const addBtn = document.getElementById('addContenderBtn');
    if(addBtn){
        addBtn.addEventListener('click', async () => {
            const name = document.getElementById('newContenderName').value.trim();
            const desc = document.getElementById('newContenderDesc').value.trim();
            if(!name) { showToast("Name required", "error"); return; }
            await apiCall('add_contender', 'POST', { name, description: desc, photo: pendingAddPhoto || null });
            showToast("Contender added", "success");
            document.getElementById('newContenderName').value = '';
            document.getElementById('newContenderDesc').value = '';
            if (addPhotoInput) addPhotoInput.value = '';
            if (addPhotoPreview) { addPhotoPreview.src = ''; addPhotoPreview.style.display = 'none'; }
            pendingAddPhoto = null;
            loadAdminContenders();
            loadAdminResults();
            if(document.getElementById('contendersList')) loadUserContenders();
        });
    }
    const resetBtn = document.getElementById('resetAllVotesBtn');
    if(resetBtn){
        resetBtn.addEventListener('click', async () => {
            if(confirm("⚠️ RESET ALL VOTES: This action is irreversible. Continue?")){
                await apiCall('reset_votes', 'POST');
                showToast("All votes reset successfully", "success");
                loadAdminResults();
                if(document.getElementById('liveResultsContainer')) displayLiveResults();
            }
        });
    }
    const refreshResults = document.getElementById('refreshResultsBtn');
    if(refreshResults) refreshResults.addEventListener('click', () => { loadAdminResults(); showToast("Results refreshed", "info"); });
    
    const countyFilter = document.getElementById('adminCountyFilter');
    if (countyFilter) {
        countyFilter.addEventListener('change', () => loadAdminResults());
    }
    
    const setActiveBtn = document.getElementById('setActiveCountyBtn');
    if (setActiveBtn) {
        setActiveBtn.addEventListener('click', async () => {
            const select = document.getElementById('activeCountySelect');
            const county = select ? select.value : '';
            if (!county) { showToast("Please select a county", "error"); return; }
            await setActiveCounty(county);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if(document.getElementById('adminLoginSection')) {
        initAdminEvents();
        apiCall('admin_check').then(res => {
            if(res.logged_in) {
                currentAdminLogged = true;
                document.getElementById('adminLoginSection').style.display = 'none';
                document.getElementById('adminDashboard').style.display = 'block';
                document.getElementById('adminLogoutBtn').style.display = 'block';
                loadAdminCounties();
                loadAdminContenders();
                loadAdminResults();
                loadCurrentActiveCounty();
            } else {
                document.getElementById('adminLoginSection').style.display = 'flex';
                document.getElementById('adminDashboard').style.display = 'none';
            }
        }).catch(()=>{});
    } else if(document.getElementById('voteForm')) {
        initUserInterface();
    }
});