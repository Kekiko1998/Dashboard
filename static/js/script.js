document.addEventListener('DOMContentLoaded', function() {
    // --- Get all relevant DOM elements ---
    const userInfoDiv = document.getElementById('userInfo');
    const userNameSpan = document.getElementById('userName');
    const homeContentCentered = document.getElementById('homeContentCentered');
    const homeTitleContainer = document.getElementById('homeTitleContainer');
    const homeSearchControlsContainer = document.getElementById('homeSearchControlsContainer');
    const topLeftDynamicContent = document.getElementById('topLeftDynamicContent');
    const searchButton = document.getElementById('searchButton');
    const monthSelect = document.getElementById('monthSelect');
    const weekSelect = document.getElementById('weekSelect');
    let baNameInput = document.getElementById('baNameInput'); 
    const palcodeInput = document.getElementById('palcodeInput');
    const homeErrorMessage = document.getElementById('homeErrorMessage');
    const dashboardTabBtn = document.getElementById('dashboardTabBtn');
    const dashboardPlaceholder = document.getElementById('dashboardPlaceholder');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const dashboardDataDisplay = document.getElementById('dashboardDataDisplay');
    const dashboardSearchError = document.getElementById('dashboardSearchError');
    const darkModeToggleButton = document.getElementById('darkModeToggle');
    const adminTabBtn = document.getElementById('adminTabBtn');
    const userManagementTableContainer = document.getElementById('userManagementTableContainer');
    const adminStatusMessage = document.getElementById('adminStatusMessage');
    const tableControls = document.getElementById('tableControls');
    const saveButton = document.getElementById('saveButton');
    const saveStatusMessage = document.getElementById('saveStatusMessage');
    const baNameSelectContainer = document.getElementById('baNameSelectContainer');
    const baNameSelectButton = document.getElementById('baNameSelectButton');
    const baNameDropdown = document.getElementById('baNameDropdown');
    const baNameSearchInput = document.getElementById('baNameSearchInput');
    const baNameCheckboxList = document.getElementById('baNameCheckboxList');
    const payoutForm = document.getElementById('payoutForm');
    const payoutFormStatus = document.getElementById('payoutFormStatus');
    const payoutInfoCards = document.getElementById('payoutInfoCards');
    const payoutTabBtn = document.getElementById('payoutTabBtn');

    // --- State Variables ---
    let isAdmin = false;
    let userPermissions = new Set();
    const statusOptions = ['PAID', 'DELAYED', 'UPDATING', 'INVALID', 'UNOFFICIAL', 'ON GOING'];

    // --- Initial Data Fetching & UI Setup ---
    function setupUIForUser(userInfo) {
        isAdmin = userInfo.isAdmin;
        userPermissions = new Set(userInfo.permissions);
        userNameSpan.textContent = userInfo.name;
        userInfoDiv.style.display = 'flex';
        if (isAdmin) {
            adminTabBtn.style.display = 'block';
        }
        if (userPermissions.has('MULTI_SELECT') || userPermissions.has('SEARCH_ALL')) {
            baNameSelectContainer.style.display = 'block';
            baNameInput.style.display = 'none';
        } else {
            baNameSelectContainer.style.display = 'none';
            baNameInput.style.display = 'block';
        }
    }

    fetch('/api/user-info').then(response => {
        if (response.status === 401) { window.location.href = '/login'; return Promise.reject('User not logged in'); }
        if (!response.ok) { throw new Error('Network response was not ok'); }
        return response.json();
    }).then(userInfo => {
        if (userInfo) {
            setupUIForUser(userInfo);
            if (userPermissions.has('MULTI_SELECT') || userPermissions.has('SEARCH_ALL')) {
                populateBaNameDropdown();
            }
        }
    }).catch(error => console.error("Initialization failed:", error));
    
    // --- Custom Multi-Select Dropdown Logic ---
    function populateBaNameDropdown() {
        fetch('/api/ba-names').then(res => res.json()).then(names => {
            baNameCheckboxList.innerHTML = '';
            names.forEach(name => {
                const label = document.createElement('label');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox'; checkbox.value = name;
                checkbox.addEventListener('change', updateBaNameButtonText);
                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(` ${name}`));
                baNameCheckboxList.appendChild(label);
            });
        }).catch(err => console.error('Error fetching BA names:', err));
    }

    function updateBaNameButtonText() {
        const checkedBoxes = baNameCheckboxList.querySelectorAll('input[type="checkbox"]:checked');
        if (checkedBoxes.length === 0) {
            baNameSelectButton.textContent = 'SELECT BA NAME';
            baNameSelectButton.classList.remove('has-selection');
        } else if (checkedBoxes.length === 1) {
            baNameSelectButton.textContent = checkedBoxes[0].value;
            baNameSelectButton.classList.add('has-selection');
        } else {
            baNameSelectButton.textContent = `${checkedBoxes.length} BAs SELECTED`;
            baNameSelectButton.classList.add('has-selection');
        }
    }

    if (baNameSelectButton) {
        baNameSelectButton.addEventListener('click', function(e) {
            baNameDropdown.classList.toggle('show');
            e.stopPropagation();
        });
    }
    if (baNameSearchInput) {
        baNameSearchInput.addEventListener('input', function() {
            const filter = baNameSearchInput.value.toLowerCase();
            Array.from(baNameCheckboxList.children).forEach(label => {
                label.style.display = label.textContent.toLowerCase().includes(filter) ? '' : 'none';
            });
        });
    }
    window.addEventListener('click', function(e) {
        if (baNameDropdown && !baNameDropdown.contains(e.target) && !baNameSelectButton.contains(e.target)) {
            baNameDropdown.classList.remove('show');
        }
    });

    // --- UI MANAGEMENT ---
    function setDarkMode(isDark) {
        if (isDark) {
            document.body.classList.remove('light-mode');
            darkModeToggleButton.textContent = '☀️';
            localStorage.setItem('dashboardTheme', 'dark');
        } else {
            document.body.classList.add('light-mode');
            darkModeToggleButton.textContent = '🌙';
            localStorage.setItem('dashboardTheme', 'light');
        }
    }
    darkModeToggleButton.addEventListener('click', () => {
        const isCurrentlyDark = !document.body.classList.contains('light-mode');
        setDarkMode(!isCurrentlyDark);
    });
    if (localStorage.getItem('dashboardTheme') === 'light') { setDarkMode(false); } else { setDarkMode(true); }

    window.showTab = function(tabId, clickedButton) {
        document.querySelectorAll(".tab-content").forEach(tab => tab.classList.remove('active-content'));
        document.querySelectorAll(".tab-button").forEach(btn => btn.classList.remove("active"));
        document.getElementById(tabId).classList.add('active-content');
        clickedButton.classList.add("active");
        if (tabId !== 'homeArea') {
            topLeftDynamicContent.appendChild(homeTitleContainer);
            topLeftDynamicContent.appendChild(homeSearchControlsContainer);
        } else {
            homeContentCentered.appendChild(homeTitleContainer);
            homeContentCentered.appendChild(homeSearchControlsContainer);
        }
        if (tabId === 'adminArea' && isAdmin) {
            loadUserManagementPanel();
        }
        if (tabId === 'payoutArea' && (isAdmin || userPermissions.has('VIEW_PAYOUTS'))) {
            loadPayoutCards();
        }
    };

    function handleMonthChange() {
        const selectedMonth = monthSelect.value;
        const week5Option = document.getElementById('week5Option');
        if (week5Option) {
            if (selectedMonth.toLowerCase() === 'june') {
                week5Option.style.display = 'block';
            } else {
                week5Option.style.display = 'none';
                if (weekSelect.value === 'Week 5') { weekSelect.value = ''; }
            }
        }
    }
    monthSelect.addEventListener('change', handleMonthChange);
    handleMonthChange();

    if (searchButton) { searchButton.addEventListener('click', performSearch); }
    
    // --- Admin Panel Functions ---
    function loadUserManagementPanel() {
        userManagementTableContainer.innerHTML = '<div class="loading-indicator">⏳ Loading users...</div>';
        adminStatusMessage.textContent = '';
        fetch('/api/users').then(res => res.json()).then(data => {
            if (data.error) throw new Error(data.error);
            buildUserTable(data.users, data.all_permissions);
        }).catch(error => {
            userManagementTableContainer.innerHTML = `<p class="error-message-main">❌ ${error.message}</p>`;
        });
    }

    // *** CORRECTED ***: Swapped the column order back to NAME | EMAIL to match the image.
    function buildUserTable(users, allPermissions) {
        userManagementTableContainer.innerHTML = '';
        const table = document.createElement('table'); table.id = 'userManagementTable';
        const thead = document.createElement('thead');
        
        let headerRowHtml = '<tr><th>Name</th><th>Email</th>'; 
        
        const displayOrder = ['EDIT_TABLE', 'SEARCH_ALL', 'VIEW_COMMISSION', 'VIEW_PAYOUTS', 'MULTI_SELECT'];
        displayOrder.forEach(perm => { 
            if (allPermissions.includes(perm)) {
                headerRowHtml += `<th>${perm.replace(/_/g, ' ')}</th>`;
            }
        });
        
        headerRowHtml += '<th>Action</th></tr>';
        thead.innerHTML = headerRowHtml; table.appendChild(thead);
        
        const tbody = document.createElement('tbody');
        users.forEach(user => {
            const tr = document.createElement('tr');
            
            let rowHtml = `<td>${user.name}</td><td>${user.email}</td>`;
            
            const userPerms = new Set(user.permissions);
            displayOrder.forEach(perm => {
                 if (allPermissions.includes(perm)) {
                    const isChecked = userPerms.has(perm) ? 'checked' : '';
                    const isDisabled = user.is_admin ? 'disabled' : '';
                    rowHtml += `<td><label class="switch"><input type="checkbox" data-permission="${perm}" ${isChecked} ${isDisabled}><span class="slider round"></span></label></td>`;
                }
            });
            const saveButtonDisabled = user.is_admin ? 'disabled' : '';
            rowHtml += `<td><button class="save-permissions-btn" ${saveButtonDisabled}>Save</button></td>`;
            tr.innerHTML = rowHtml; tbody.appendChild(tr);
        });
        table.appendChild(tbody); userManagementTableContainer.appendChild(table);
        document.querySelectorAll('.save-permissions-btn').forEach(button => {
            button.addEventListener('click', handlePermissionSave);
        });
    }

    function handlePermissionSave(event) {
        const button = event.target;
        const row = button.closest('tr');
        const email = row.cells[1].textContent; // Email is now in the SECOND cell (index 1)
        
        if (!email) {
            adminStatusMessage.textContent = `Error: Could not find email for this row.`;
            adminStatusMessage.className = 'admin-status-message error';
            return;
        }

        const selectedPermissions = [];
        row.querySelectorAll('input[type="checkbox"]:checked').forEach(checkbox => {
            selectedPermissions.push(checkbox.dataset.permission);
        });
        
        button.textContent = 'Saving...'; 
        button.disabled = true; 
        adminStatusMessage.textContent = '';

        fetch('/api/update_user_permission', {
            method: 'POST', 
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email: email, permissions: selectedPermissions })
        }).then(res => res.json()).then(data => {
            if (data.success) {
                adminStatusMessage.textContent = data.message;
                adminStatusMessage.className = 'admin-status-message success';
            } else { throw new Error(data.error); }
        }).catch(error => {
            adminStatusMessage.textContent = `Error: ${error.message}`;
            adminStatusMessage.className = 'admin-status-message error';
        }).finally(() => {
            button.textContent = 'Save';
            const firstCheckbox = row.querySelector('input[type=checkbox]');
            if (!firstCheckbox || !firstCheckbox.disabled) {
                button.disabled = false;
            }
            setTimeout(() => { adminStatusMessage.textContent = ''; adminStatusMessage.className = 'admin-status-message'; }, 5000);
        });
    }

    // --- Search & Data Handling ---
    function performSearch() {
        const month = monthSelect.value, week = weekSelect.value, palcode = palcodeInput.value.trim();
        let baNamesToSearch = [];
        if (userPermissions.has('MULTI_SELECT') || userPermissions.has('SEARCH_ALL')) {
            const checkedBoxes = baNameCheckboxList.querySelectorAll('input[type="checkbox"]:checked');
            checkedBoxes.forEach(checkbox => baNamesToSearch.push(checkbox.value));
        } else {
            const baNameValue = baNameInput.value.trim();
            if (baNameValue) baNamesToSearch.push(baNameValue);
        }
        const errorTarget = document.getElementById('homeErrorMessage'); 
        errorTarget.textContent = ''; let missingFields = [];
        if (!month) missingFields.push("MONTH");
        if (!week) missingFields.push("WEEK");
        if (!userPermissions.has('SEARCH_ALL') && baNamesToSearch.length === 0) { missingFields.push("BA NAME"); }
        if (missingFields.length > 0) { errorTarget.textContent = `❌ Please select: ${missingFields.join(', ')}.`; return; }
        searchButton.disabled = true; searchButton.textContent = 'SEARCHING...';
        showTab('dashboardDisplayArea', dashboardTabBtn); 
        dashboardPlaceholder.style.display = 'none'; dashboardDataDisplay.style.display = 'none';
        dashboardSearchError.style.display = 'none'; loadingIndicator.style.display = 'flex';
        const searchPayload = { month: month, week: week, baNames: baNamesToSearch, palcode: palcode };
        fetch('/api/search', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(searchPayload),
        }).then(res => {
            if (res.status === 401) { window.location.href = '/login'; return Promise.reject('Session expired'); }
            if (!res.ok) { return res.json().then(errData => { throw new Error(errData.error || `Server error: ${res.status}`); }); }
            return res.json();
        }).then(data => handleSearchSuccess(data)).catch(error => handleSearchFailure(error));
    }

    function handleSearchSuccess(data) {
        searchButton.disabled = false; searchButton.textContent = 'SEARCH'; loadingIndicator.style.display = 'none';
        if (data.error || (!data.resultsTable && !data.summary)) {
            dashboardSearchError.querySelector('p').textContent = `⚠️ ${data.error || 'An unknown error occurred.'}`;
            dashboardSearchError.style.display = 'flex'; dashboardDataDisplay.style.display = 'none';
            return;
        }
        const hasData = (data.resultsTable && data.resultsTable.length > 0) || (data.summary && data.summary.totalValidFd > 0);
        if (hasData) {
            dashboardSearchError.style.display = 'none'; populateDashboardWithData(data); dashboardDataDisplay.style.display = 'flex';
        } else {
            dashboardSearchError.querySelector('p').textContent = `⚠️ ${data.message || 'No data found for this query.'}`;
            dashboardSearchError.style.display = 'flex'; dashboardDataDisplay.style.display = 'none';
        }
    }
    function handleSearchFailure(error) {
        if (error.message.includes('Session expired')) { console.log("Session expired, redirecting..."); return; }
        searchButton.disabled = false; searchButton.textContent = 'SEARCH'; loadingIndicator.style.display = 'none';
        dashboardSearchError.querySelector('p').textContent = `❌ Script Error: ${error.message || 'Unknown error.'}`;
        dashboardSearchError.style.display = 'flex'; dashboardDataDisplay.style.display = 'none';
        console.error("Server Call Error:", error);
    }

    function determineSummaryStatus(tableData) {
        const statusColumnIndex = 11;
        if (!tableData || tableData.length === 0) return { text: 'N/A', class: '' };
        const statuses = new Set(tableData.map(row => row[statusColumnIndex]?.toString().trim().toLowerCase()).filter(Boolean));
        if (statuses.size === 0) return { text: 'N/A', class: '' };
        if (statuses.size === 1) {
            const singleStatus = statuses.values().next().value; const formattedText = singleStatus.replace(/-/g, ' ').toUpperCase();
            return { text: formattedText, class: `status-${singleStatus.replace(/\s+/g, '-')}` };
        }
        const priority = ['delayed', 'on-going', 'updating', 'paid', 'invalid', 'unofficial'];
        for (const p of priority) {
            if (statuses.has(p)) {
                const formattedText = p.replace(/-/g, ' ').toUpperCase();
                return { text: formattedText, class: `status-${p.replace(/\s+/g, '-')}` };
            }
        }
        return { text: 'MIXED', class: '' };
    }
    
    function populateDashboardWithData(data) {
        const baNameDisplay = document.getElementById('baNameDisplay'), totalRegistrationValue = document.getElementById('totalRegistrationValue'), totalValidFdValue = document.getElementById('totalValidFdValue'), totalSuspendedValue = document.getElementById('totalSuspendedValue'), totalSalaryValue = document.getElementById('totalSalaryValue'), totalIncentiveValue = document.getElementById('totalIncentiveValue'), monthDisplay = document.getElementById('monthDisplay'), weekDisplay = document.getElementById('weekDisplay'), dateRangeDisplay = document.getElementById('dateRangeDisplay'), statusValue = document.getElementById('statusValue'), lastUpdateValue = document.getElementById('lastUpdateValue'), baRankingListDiv = document.getElementById('baRankingList'), resultsTableContainer = document.getElementById('resultsTableContainer');
        const commissionCard = document.getElementById('commissionCard');
        const totalCommissionValue = document.getElementById('totalCommissionValue');

        if (commissionCard) { commissionCard.style.display = userPermissions.has('VIEW_COMMISSION') ? 'flex' : 'none'; }
        if(baNameDisplay) {
            baNameDisplay.innerHTML = ''; baNameDisplay.className = 'ba-name-display'; 
            const selectedNames = data.searchCriteria?.baNames || [];
            if (selectedNames.length > 1 && (userPermissions.has('MULTI_SELECT') || userPermissions.has('SEARCH_ALL'))) {
                const namesContainer = document.createElement('div'); namesContainer.className = 'ba-name-scroll-content';
                const appendNames = () => {
                    selectedNames.forEach((name) => {
                        const nameSpan = document.createElement('span'); nameSpan.className = 'ba-name-scroll-item'; nameSpan.textContent = name; namesContainer.appendChild(nameSpan);
                        const separatorSpan = document.createElement('span'); separatorSpan.className = 'ba-name-scroll-separator'; separatorSpan.textContent = '|'; namesContainer.appendChild(separatorSpan);
                    });
                };
                appendNames(); appendNames(); 
                const animationDuration = selectedNames.length * 5;
                namesContainer.style.animationDuration = `${animationDuration}s`;
                baNameDisplay.appendChild(namesContainer);
            } else { baNameDisplay.textContent = data.baNameDisplay || "ALL BA's"; }
        }

        const summary = data.summary || {};
        if(totalRegistrationValue) animateValue(totalRegistrationValue, 0, summary.totalRegistration || 0, 700);
        if(totalValidFdValue) animateValue(totalValidFdValue, 0, summary.totalValidFd || 0, 700);
        if(totalSuspendedValue) animateValue(totalSuspendedValue, 0, summary.totalSuspended || 0, 700);
        if(totalSalaryValue) animateValue(totalSalaryValue, 0, summary.totalSalary || 0, 700, true);
        if(totalIncentiveValue) animateValue(totalIncentiveValue, 0, summary.totalIncentives || 0, 700, true);
        if (totalCommissionValue && userPermissions.has('VIEW_COMMISSION')) { animateValue(totalCommissionValue, 0, summary.totalCommission || 0, 700); }
        if(monthDisplay) monthDisplay.textContent = data.monthDisplay || "N/A";
        if(weekDisplay) weekDisplay.textContent = data.weekDisplay || "N/A";
        if(dateRangeDisplay) dateRangeDisplay.textContent = data.dateRangeDisplay || ""; 
        if (statusValue) { const summaryStatus = determineSummaryStatus(data.resultsTable); statusValue.textContent = summaryStatus.text; statusValue.className = summaryStatus.class; }
        if(lastUpdateValue) { lastUpdateValue.textContent = data.lastUpdate || "N/A"; }
        if (baRankingListDiv) {
            baRankingListDiv.innerHTML = ''; 
            if (data.rankedBaList && data.rankedBaList.length > 0) {
                data.rankedBaList.forEach((ba, index) => {
                    const itemDiv = document.createElement('div'); itemDiv.classList.add('ba-rank-item');
                    const rankSpan = document.createElement('span'); rankSpan.classList.add('rank-number'); rankSpan.textContent = `${index + 1}.`;
                    const nameSpan = document.createElement('span'); nameSpan.classList.add('ba-name'); nameSpan.textContent = ba.originalName || "N/A"; nameSpan.title = ba.originalName || "N/A";
                    const fdSpan = document.createElement('span'); fdSpan.classList.add('ba-fd-count'); fdSpan.textContent = (ba.totalFd || 0).toLocaleString();
                    itemDiv.appendChild(rankSpan); itemDiv.appendChild(nameSpan); itemDiv.appendChild(fdSpan);
                    baRankingListDiv.appendChild(itemDiv);
                });
            } else { baRankingListDiv.innerHTML = '<p style="text-align:center; font-size:0.8em; color:var(--text-color-subtle);">No BA ranking data available.</p>'; }
        }
        
        resultsTableContainer.innerHTML = '';
        if (userPermissions.has('EDIT_TABLE') && data.resultsTable && data.resultsTable.length > 0) {
            tableControls.style.display = 'flex';
        } else { tableControls.style.display = 'none'; }
        if (data.resultsTable && data.resultsTable.length > 0) {
            const table = document.createElement('table'), thead = document.createElement('thead'), tbody = document.createElement('tbody'), headerRow = document.createElement('tr');
            const headers = ['PALCODE','MONTH','WEEK','BA Name','REG','Valid FD','Suspended FD','Rate','GGR Per FD','Total GGR','SALARY','Status'];
            const editableColumns = ['MONTH', 'WEEK', 'BA Name', 'REG', 'Valid FD', 'Suspended FD', 'Total GGR'];
            const thNo = document.createElement('th'); thNo.textContent = 'No.'; headerRow.appendChild(thNo);
            headers.forEach(text => { const th = document.createElement('th'); th.textContent = text.toUpperCase(); headerRow.appendChild(th); });
            thead.appendChild(headerRow); table.appendChild(thead);
            
            data.resultsTable.forEach((rowData, rowIndex) => {
                const tr = document.createElement('tr');
                tr.dataset.palcode = rowData[0];
                tr.dataset.month = rowData[1];
                tr.dataset.week = rowData[2];

                tr.classList.add('result-row-animate'); tr.style.animationDelay = `${rowIndex * 0.05}s`;
                const tdNo = document.createElement('td'); tdNo.textContent = rowIndex + 1; tr.appendChild(tdNo);
                headers.forEach((header, cellIndex) => {
                    const td = document.createElement('td');
                    const fieldName = header.toLowerCase().replace(/ /g, '_'); td.dataset.field = fieldName;
                    const cellData = (rowData[cellIndex] === null || rowData[cellIndex] === undefined) ? '' : rowData[cellIndex];
                    if (userPermissions.has('EDIT_TABLE') && header === 'Status') {
                        const select = document.createElement('select');
                        statusOptions.forEach(option => {
                            const optionEl = document.createElement('option');
                            optionEl.value = option; optionEl.textContent = option;
                            if (option.toUpperCase() === cellData.toString().toUpperCase()) { optionEl.selected = true; }
                            select.appendChild(optionEl);
                        });
                        td.appendChild(select);
                    } else {
                        td.textContent = cellData;
                        if (userPermissions.has('EDIT_TABLE') && editableColumns.includes(header)) {
                            td.contentEditable = "true"; td.classList.add('editable-cell');
                        }
                    }
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });
            table.appendChild(tbody); resultsTableContainer.appendChild(table);
        } else { resultsTableContainer.innerHTML = `<p class="no-data-message">${data.message || 'Summary data is shown in the left panel. No detailed records for this query.'}</p>`; }
        if(dashboardDataDisplay) { dashboardDataDisplay.style.opacity = '0'; setTimeout(() => { dashboardDataDisplay.style.opacity = '1'; }, 50); }
    }
    
    if (saveButton) {
        saveButton.addEventListener('click', async () => {
            saveButton.disabled = true; saveStatusMessage.textContent = 'Saving...'; saveStatusMessage.className = 'saving';
            const dataToSave = [];
            const tableRows = document.querySelectorAll('#resultsTableContainer tbody tr');

            tableRows.forEach(row => {
                const statusElement = row.querySelector('[data-field="status"]');
                const rowData = {
                    palcode: row.dataset.palcode,
                    original_month: row.dataset.month,
                    original_week: row.dataset.week,
                    month: row.querySelector('[data-field="month"]').textContent,
                    week: row.querySelector('[data-field="week"]').textContent,
                    ba_name: row.querySelector('[data-field="ba_name"]').textContent,
                    reg: row.querySelector('[data-field="reg"]').textContent,
                    valid_fd: row.querySelector('[data-field="valid_fd"]').textContent,
                    suspended_fd: row.querySelector('[data-field="suspended_fd"]').textContent,
                    rate: row.querySelector('[data-field="rate"]').textContent,
                    ggr_per_fd: row.querySelector('[data-field="ggr_per_fd"]').textContent,
                    total_ggr: row.querySelector('[data-field="total_ggr"]').textContent,
                    salary: row.querySelector('[data-field="salary"]').textContent,
                    status: statusElement.querySelector('select') ? statusElement.querySelector('select').value : statusElement.textContent
                };
                dataToSave.push(rowData);
            });
            
            try {
                const response = await fetch('/api/save_dashboard', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(dataToSave) });
                if (response.status === 401) { window.location.href = '/login'; return; }
                const result = await response.json();
                if (result.success) {
                    saveStatusMessage.textContent = result.message || 'Save Successful!';
                    saveStatusMessage.className = 'success';
                } else { throw new Error(result.error || 'Unknown error occurred.'); }
            } catch (error) {
                saveStatusMessage.textContent = `Error: ${error.message}`;
                saveStatusMessage.className = 'error';
                console.error('Save failed:', error);
            } finally {
                saveButton.disabled = false;
                setTimeout(() => { saveStatusMessage.textContent = ''; saveStatusMessage.className = ''; }, 7000);
            }
        });
    }

    // --- Payout Section ---
    if (payoutForm) {
        const fileInput = document.getElementById('qr_image_input');
        const fileChosenSpan = document.getElementById('file-chosen');
        if (fileInput && fileChosenSpan) {
            fileInput.addEventListener('change', function() {
                if (this.files.length > 0) {
                    fileChosenSpan.textContent = this.files[0].name;
                } else {
                    fileChosenSpan.textContent = 'No file chosen';
                }
            });
        }
        payoutForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            payoutFormStatus.textContent = 'Uploading...'; 
            const formData = new FormData(payoutForm);
            try {
                const res = await fetch('/api/payout/submit', { method: 'POST', body: formData });
                const data = await res.json();
                if (data.success) {
                    payoutFormStatus.textContent = data.message;
                    payoutForm.reset();
                    if (fileChosenSpan) fileChosenSpan.textContent = 'No file chosen';
                    if (isAdmin || userPermissions.has('VIEW_PAYOUTS')) {
                        setTimeout(loadPayoutCards, 1000);
                    }
                } else {
                    payoutFormStatus.textContent = `Error: ${data.error || 'Submission failed.'}`;
                }
            } catch (err) {
                payoutFormStatus.textContent = 'An unexpected error occurred.';
            }
        });
    }

    async function loadPayoutCards() {
        if (!payoutInfoCards || (!isAdmin && !userPermissions.has('VIEW_PAYOUTS'))) return;
        payoutInfoCards.innerHTML = '<div class="loading-indicator">⏳ Loading submissions...</div>';
        try {
            const res = await fetch('/api/payout/list');
            const data = await res.json();
            if (!data.success) {
                payoutInfoCards.innerHTML = `<div class="error-message-main">${data.error || 'Failed to load.'}</div>`;
                return;
            }
            if (!data.payouts || data.payouts.length === 0) {
                payoutInfoCards.innerHTML = '<div class="no-payouts-message">No payout submissions yet.</div>';
                return;
            }
            payoutInfoCards.innerHTML = data.payouts.map(p => `
                <div class="payout-card">
                    <div><strong>BA NAME:</strong> ${p.ba_name}</div>
                    <div><strong>MOP ACCOUNT NAME:</strong> ${p.mop_account_name}</div>
                    <div><strong>MOP NUMBER:</strong> ${p.mop_number}</div>
                    <div><strong>Submitted by:</strong> ${p.user_email}</div>
                    <div><strong>Date:</strong> ${new Date(p.submitted_at).toLocaleString()}</div>
                    <a href="/uploads/${p.qr_image}" target="_blank" title="View full size QR">
                        <img src="/uploads/${p.qr_image}" alt="QR Code">
                    </a>
                    ${isAdmin ? `<button class="delete-payout-btn" data-payout-id="${p.submitted_at}">Delete</button>` : ''}
                </div>
            `).join('');
        } catch (err) {
            payoutInfoCards.innerHTML = '<div class="error-message-main">Failed to load payout submissions.</div>';
        }
    }

    async function handlePayoutDelete(event) {
        const button = event.target;
        const payoutId = button.dataset.payoutId;
        if (!confirm('Are you sure you want to delete this submission? This action cannot be undone.')) {
            return;
        }
        button.textContent = 'Deleting...';
        button.disabled = true;
        try {
            const response = await fetch('/api/payout/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: payoutId })
            });
            const result = await response.json();
            if (result.success) {
                const card = button.closest('.payout-card');
                if (card) {
                    card.remove();
                }
            } else {
                throw new Error(result.error || 'Failed to delete submission.');
            }
        } catch (error) {
            alert('Error: ' + error.message);
            button.textContent = 'Delete';
            button.disabled = false;
        }
    }
    
    payoutInfoCards.addEventListener('click', function(event) {
        if (event.target.classList.contains('delete-payout-btn')) {
            handlePayoutDelete(event);
        }
    });

    function animateValue(element, start, end, duration, isCurrency = false) {
        if (!element || typeof end !== 'number' || isNaN(end)) {
             if(element && isCurrency) element.textContent = `₱ 0.00`;
             else if(element) element.textContent = `0`;
             return;
        }
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            let currentValue = Math.floor(progress * (end - start) + start);
            let displayValue;
            if (isCurrency) {
                displayValue = `₱ ${currentValue.toLocaleString()}`;
                if (progress >= 1) { displayValue = `₱ ${parseFloat(end).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`; }
            } else {
                displayValue = currentValue.toLocaleString();
                if (progress >= 1) { displayValue = end.toLocaleString(); }
            }
            element.textContent = displayValue;
            if (progress < 1) { window.requestAnimationFrame(step); }
        };
        window.requestAnimationFrame(step);
    }
});