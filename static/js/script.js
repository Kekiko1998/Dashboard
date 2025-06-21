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
    const baNameSuggestions = document.getElementById('baNameSuggestions');
    const adminTabBtn = document.getElementById('adminTabBtn');
    const userManagementTableContainer = document.getElementById('userManagementTableContainer');
    const adminStatusMessage = document.getElementById('adminStatusMessage');
    const tableControls = document.getElementById('tableControls');
    const saveButton = document.getElementById('saveButton');
    const saveStatusMessage = document.getElementById('saveStatusMessage');

    // --- State Variables ---
    let isAdmin = false;
    let userPermissions = new Set(); // Use a Set for fast permission lookups
    let selectedBaNamesState = [];
    const statusOptions = ['PAID', 'DELAYED', 'UPDATING', 'INVALID', 'UNOFFICIAL'];

    // --- Initial Data Fetching ---
    function setupUIForUser(userInfo) {
        isAdmin = userInfo.isAdmin;
        userPermissions = new Set(userInfo.permissions);

        userNameSpan.textContent = userInfo.name;
        userInfoDiv.style.display = 'flex';

        if (isAdmin) {
            adminTabBtn.style.display = 'block';
        }

        const activeTabButton = document.querySelector('.tab-button.active');
        if (userPermissions.has('MULTI_SELECT') && activeTabButton && activeTabButton.id === 'homeTabBtn') {
            switchToMultiSelectView();
        }
    }

    fetch('/api/user-info').then(response => {
        if (response.status === 401) { window.location.href = '/login'; return Promise.reject('User not logged in'); }
        if (!response.ok) { throw new Error('Network response was not ok'); }
        return response.json();
    }).then(userInfo => {
        if (userInfo) { setupUIForUser(userInfo); populateBaNameSuggestions(); }
    }).catch(error => console.error("Initialization failed:", error));

    function populateBaNameSuggestions() {
        fetch('/api/ba-names').then(res => res.json()).then(names => {
            if (baNameSuggestions && names && names.length > 0) {
                baNameSuggestions.innerHTML = '';
                names.forEach(name => {
                    const option = document.createElement('option');
                    option.value = name;
                    baNameSuggestions.appendChild(option);
                });
            }
        }).catch(err => console.error('Error fetching BA names:', err));
    }

    // --- Special User UI Transformation Functions ---
    function switchToMultiSelectView() {
        if (document.getElementById('baNameMultiSelectWrapper') || !userPermissions.has('MULTI_SELECT')) return;
        const currentInput = document.getElementById('baNameInput');
        const originalParent = currentInput.parentNode;
        const wrapper = document.createElement('div');
        wrapper.id = 'baNameMultiSelectWrapper';
        wrapper.className = 'ba-input-wrapper-flex';
        originalParent.replaceChild(wrapper, currentInput);
        wrapper.appendChild(currentInput);
        baNameInput = document.getElementById('baNameInput');
        baNameInput.placeholder = 'TYPE BA NAME & PRESS ENTER, OR LEAVE BLANK FOR ALL';
        baNameInput.value = '';
        selectedBaNamesState.forEach(name => addTag(name, false));
        updateVisibleTags();
        baNameInput.addEventListener('keydown', handleMultiSelectKeyDown);
        wrapper.addEventListener('click', handleWrapperClick);
    }
    function switchToSimpleView() {
        if (!userPermissions.has('MULTI_SELECT')) return;
        const wrapper = document.getElementById('baNameMultiSelectWrapper');
        if (!wrapper) return;
        const input = document.getElementById('baNameInput');
        const parent = wrapper.parentNode;
        parent.replaceChild(input, wrapper);
        baNameInput = document.getElementById('baNameInput');
        baNameInput.placeholder = 'ENTER BA NAME';
        baNameInput.classList.remove('placeholder-hidden');
        if (selectedBaNamesState.length === 1) {
            baNameInput.value = selectedBaNamesState[0];
        } else {
            baNameInput.value = '';
        }
        input.removeEventListener('keydown', handleMultiSelectKeyDown);
    }
    function handleMultiSelectKeyDown(e) { if (e.key === 'Enter' && baNameInput.value.trim() !== '') { e.preventDefault(); addTag(baNameInput.value.trim(), true); baNameInput.value = ''; } }
    function handleWrapperClick(e) { if (e.target.id === 'baNameMultiSelectWrapper') { baNameInput.focus(); } }
    function updateVisibleTags() {
        const wrapper = document.getElementById('baNameMultiSelectWrapper');
        if (!wrapper) return;
        const allNameTags = Array.from(wrapper.querySelectorAll('.ba-tag[data-name]'));
        const existingCounter = wrapper.querySelector('.ba-tag-counter');
        if (existingCounter) wrapper.removeChild(existingCounter);
        allNameTags.forEach(tag => tag.style.display = 'none');
        if (allNameTags.length > 0) {
            const lastTag = allNameTags[allNameTags.length - 1];
            lastTag.style.display = 'inline-flex';
            if (allNameTags.length > 1) {
                const counterTag = document.createElement('div');
                counterTag.className = 'ba-tag ba-tag-counter';
                counterTag.textContent = `+${allNameTags.length - 1}`;
                counterTag.title = `${allNameTags.length - 1} more BA(s) selected`;
                wrapper.insertBefore(counterTag, lastTag.nextSibling);
            }
            baNameInput.classList.add('placeholder-hidden');
        } else {
            baNameInput.classList.remove('placeholder-hidden');
        }
    }
    function addTag(name, updateStateArray) {
        if (updateStateArray) {
            const lowerCaseName = name.toLowerCase();
            if (!selectedBaNamesState.map(n => n.toLowerCase()).includes(lowerCaseName)) {
                selectedBaNamesState.push(name);
            } else { return; }
        }
        const wrapper = document.getElementById('baNameMultiSelectWrapper');
        if (!wrapper) return;
        const tag = document.createElement('div');
        tag.className = 'ba-tag';
        tag.setAttribute('data-name', name);
        const tagName = document.createElement('span');
        tagName.textContent = name;
        tag.appendChild(tagName);
        const removeBtn = document.createElement('span');
        removeBtn.className = 'remove-tag';
        removeBtn.innerHTML = '×';
        removeBtn.title = `Remove ${name}`;
        removeBtn.onclick = function(event) {
            event.stopPropagation();
            selectedBaNamesState = selectedBaNamesState.filter(n => n.toLowerCase() !== name.toLowerCase());
            wrapper.removeChild(tag);
            updateVisibleTags();
        };
        tag.appendChild(removeBtn);
        wrapper.insertBefore(tag, baNameInput);
        updateVisibleTags();
    }
    
    // --- UI MANAGEMENT (DARK MODE, TABS, WEEK 5) ---
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
    if (localStorage.getItem('dashboardTheme') === 'light') {
        setDarkMode(false);
    } else {
        setDarkMode(true);
    }

    window.showTab = function(tabId, clickedButton) {
        document.querySelectorAll(".tab-content").forEach(tab => tab.classList.remove('active-content'));
        document.querySelectorAll(".tab-button").forEach(btn => btn.classList.remove("active"));
        document.getElementById(tabId).classList.add('active-content');
        clickedButton.classList.add("active");

        if (tabId === 'homeArea') {
            homeContentCentered.appendChild(homeTitleContainer);
            homeContentCentered.appendChild(homeSearchControlsContainer);
            if (userPermissions.has('MULTI_SELECT')) switchToMultiSelectView();
        } else {
            topLeftDynamicContent.appendChild(homeTitleContainer);
            topLeftDynamicContent.appendChild(homeSearchControlsContainer);
            if (userPermissions.has('MULTI_SELECT')) switchToSimpleView();
        }

        if (tabId === 'adminArea' && isAdmin) {
            loadUserManagementPanel();
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
                if (weekSelect.value === 'Week 5') {
                    weekSelect.value = '';
                }
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
        
        fetch('/api/users')
            .then(res => res.json())
            .then(data => {
                if (data.error) throw new Error(data.error);
                buildUserTable(data.users, data.all_permissions);
            })
            .catch(error => {
                userManagementTableContainer.innerHTML = `<p class="error-message-main">❌ ${error.message}</p>`;
            });
    }

    function buildUserTable(users, allPermissions) {
        userManagementTableContainer.innerHTML = '';
        const table = document.createElement('table');
        table.id = 'userManagementTable';
        
        const thead = document.createElement('thead');
        let headerRowHtml = '<tr><th>Name</th><th>Email</th>';
        allPermissions.forEach(perm => {
            headerRowHtml += `<th>${perm.replace('_', ' ')}</th>`;
        });
        headerRowHtml += '<th>Action</th></tr>';
        thead.innerHTML = headerRowHtml;
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        users.forEach(user => {
            const tr = document.createElement('tr');
            tr.dataset.email = user.email;

            let rowHtml = `<td>${user.name}</td><td>${user.email}</td>`;
            const userPerms = new Set(user.permissions);
            
            allPermissions.forEach(perm => {
                const isChecked = userPerms.has(perm) ? 'checked' : '';
                const isDisabled = user.is_admin ? 'disabled' : '';
                rowHtml += `
                    <td>
                        <label class="switch">
                            <input type="checkbox" data-permission="${perm}" ${isChecked} ${isDisabled}>
                            <span class="slider round"></span>
                        </label>
                    </td>`;
            });

            const saveButtonDisabled = user.is_admin ? 'disabled' : '';
            rowHtml += `<td><button class="save-permissions-btn" ${saveButtonDisabled}>Save</button></td>`;
            tr.innerHTML = rowHtml;
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        userManagementTableContainer.appendChild(table);

        document.querySelectorAll('.save-permissions-btn').forEach(button => {
            button.addEventListener('click', handlePermissionSave);
        });
    }

    function handlePermissionSave(event) {
        const button = event.target;
        const row = button.closest('tr');
        const email = row.dataset.email;
        
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
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                adminStatusMessage.textContent = data.message;
                adminStatusMessage.className = 'admin-status-message success';
            } else {
                throw new Error(data.error);
            }
        })
        .catch(error => {
            adminStatusMessage.textContent = `Error: ${error.message}`;
            adminStatusMessage.className = 'admin-status-message error';
        })
        .finally(() => {
            button.textContent = 'Save';
            if (!row.querySelector('input[type=checkbox]').disabled) {
                button.disabled = false;
            }
            setTimeout(() => { adminStatusMessage.textContent = ''; adminStatusMessage.className = 'admin-status-message'; }, 5000);
        });
    }

    // --- Search & Data Handling ---
    function performSearch() {
        const month = monthSelect.value, week = weekSelect.value, palcode = palcodeInput.value.trim();
        let baNamesToSearch;
        const baNameInputValue = document.getElementById('baNameInput').value.trim();
        if (userPermissions.has('MULTI_SELECT')) {
            if (document.getElementById('baNameMultiSelectWrapper')) {
                if (baNameInputValue !== '') { addTag(baNameInputValue, true); document.getElementById('baNameInput').value = ''; }
                baNamesToSearch = selectedBaNamesState;
            } else {
                baNamesToSearch = baNameInputValue ? [baNameInputValue] : [];
            }
        } else {
             baNamesToSearch = baNameInputValue ? [baNameInputValue] : [];
        }

        const errorTarget = document.getElementById('homeErrorMessage'); 
        errorTarget.textContent = ''; 
        let missingFields = [];
        if (!month) missingFields.push("MONTH");
        if (!week) missingFields.push("WEEK");
        if (!userPermissions.has('SEARCH_ALL') && baNamesToSearch.length === 0) {
             missingFields.push("BA NAME");
        }
        if (missingFields.length > 0) { 
            errorTarget.textContent = `❌ Please select: ${missingFields.join(', ')}.`; 
            return; 
        }

        searchButton.disabled = true; 
        searchButton.textContent = 'SEARCHING...';
        showTab('dashboardDisplayArea', dashboardTabBtn); 
        dashboardPlaceholder.style.display = 'none'; 
        dashboardDataDisplay.style.display = 'none';
        dashboardSearchError.style.display = 'none'; 
        loadingIndicator.style.display = 'flex';
        const searchPayload = { month: month, week: week, baNames: baNamesToSearch, palcode: palcode };
        fetch('/api/search', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(searchPayload),
        })
        .then(res => {
            if (res.status === 401) { window.location.href = '/login'; return Promise.reject('Session expired'); }
            if (!res.ok) { return res.json().then(errData => { throw new Error(errData.error || `Server error: ${res.status}`); }); }
            return res.json();
        })
        .then(data => handleSearchSuccess(data))
        .catch(error => handleSearchFailure(error));
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

        if (commissionCard) {
            commissionCard.style.display = userPermissions.has('VIEW_COMMISSION') ? 'flex' : 'none';
        }
        
        if(baNameDisplay) {
            baNameDisplay.innerHTML = ''; 
            baNameDisplay.className = 'ba-name-display'; 
            const selectedNames = data.searchCriteria?.baNames || [];
            
            if (selectedNames.length > 1 && userPermissions.has('MULTI_SELECT')) {
                const namesContainer = document.createElement('div');
                namesContainer.className = 'ba-name-scroll-content';
                const appendNames = () => {
                    selectedNames.forEach((name) => {
                        const nameSpan = document.createElement('span');
                        nameSpan.className = 'ba-name-scroll-item';
                        nameSpan.textContent = name;
                        namesContainer.appendChild(nameSpan);
                        const separatorSpan = document.createElement('span');
                        separatorSpan.className = 'ba-name-scroll-separator';
                        separatorSpan.textContent = '|';
                        namesContainer.appendChild(separatorSpan);
                    });
                };
                appendNames(); 
                appendNames(); 
                const animationDuration = selectedNames.length * 5;
                namesContainer.style.animationDuration = `${animationDuration}s`;
                baNameDisplay.appendChild(namesContainer);
            } else {
                baNameDisplay.textContent = data.baNameDisplay || "ALL BA's";
            }
        }

        const summary = data.summary || {};
        if(totalRegistrationValue) animateValue(totalRegistrationValue, 0, summary.totalRegistration || 0, 700);
        if(totalValidFdValue) animateValue(totalValidFdValue, 0, summary.totalValidFd || 0, 700);
        if(totalSuspendedValue) animateValue(totalSuspendedValue, 0, summary.totalSuspended || 0, 700);
        if(totalSalaryValue) animateValue(totalSalaryValue, 0, summary.totalSalary || 0, 700, true);
        if(totalIncentiveValue) animateValue(totalIncentiveValue, 0, summary.totalIncentives || 0, 700, true);
        
        if (totalCommissionValue && userPermissions.has('VIEW_COMMISSION')) {
            animateValue(totalCommissionValue, 0, summary.totalCommission || 0, 700);
        }
        
        if(monthDisplay) monthDisplay.textContent = data.monthDisplay || "N/A";
        if(weekDisplay) weekDisplay.textContent = data.weekDisplay || "N/A";
        if(dateRangeDisplay) dateRangeDisplay.textContent = data.dateRangeDisplay || ""; 
        if (statusValue) {
            const summaryStatus = determineSummaryStatus(data.resultsTable);
            statusValue.textContent = summaryStatus.text; statusValue.className = summaryStatus.class;
        }
        if(lastUpdateValue) { lastUpdateValue.textContent = data.lastUpdate || "N/A"; }
        
        if (baRankingListDiv) {
            baRankingListDiv.innerHTML = ''; 
            if (data.rankedBaList && data.rankedBaList.length > 0) {
                data.rankedBaList.forEach((ba, index) => {
                    const itemDiv = document.createElement('div');
                    itemDiv.classList.add('ba-rank-item');
                    const rankSpan = document.createElement('span');
                    rankSpan.classList.add('rank-number');
                    rankSpan.textContent = `${index + 1}.`;
                    const nameSpan = document.createElement('span');
                    nameSpan.classList.add('ba-name');
                    nameSpan.textContent = ba.originalName || "N/A"; 
                    nameSpan.title = ba.originalName || "N/A";
                    const fdSpan = document.createElement('span');
                    fdSpan.classList.add('ba-fd-count');
                    fdSpan.textContent = (ba.totalFd || 0).toLocaleString();
                    itemDiv.appendChild(rankSpan); itemDiv.appendChild(nameSpan); itemDiv.appendChild(fdSpan);
                    baRankingListDiv.appendChild(itemDiv);
                });
            } else {
                baRankingListDiv.innerHTML = '<p style="text-align:center; font-size:0.8em; color:var(--text-color-subtle);">No BA ranking data available.</p>';
            }
        }
        
        resultsTableContainer.innerHTML = '';
        if (userPermissions.has('EDIT_TABLE') && data.resultsTable && data.resultsTable.length > 0) {
            tableControls.style.display = 'flex';
        } else {
            tableControls.style.display = 'none';
        }
        
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
                tr.classList.add('result-row-animate'); tr.style.animationDelay = `${rowIndex * 0.05}s`;
                
                const tdNo = document.createElement('td'); tdNo.textContent = rowIndex + 1; tr.appendChild(tdNo);

                headers.forEach((header, cellIndex) => {
                    const td = document.createElement('td');
                    const fieldName = header.toLowerCase().replace(/ /g, '_');
                    td.dataset.field = fieldName;
                    const cellData = (rowData[cellIndex] === null || rowData[cellIndex] === undefined) ? '' : rowData[cellIndex];

                    if (userPermissions.has('EDIT_TABLE') && header === 'Status') {
                        const select = document.createElement('select');
                        statusOptions.forEach(option => {
                            const optionEl = document.createElement('option');
                            optionEl.value = option;
                            optionEl.textContent = option;
                            if (option.toUpperCase() === cellData.toString().toUpperCase()) {
                                optionEl.selected = true;
                            }
                            select.appendChild(optionEl);
                        });
                        td.appendChild(select);
                    } else {
                        td.textContent = cellData;
                        if (userPermissions.has('EDIT_TABLE') && editableColumns.includes(header)) {
                            td.contentEditable = "true";
                            td.classList.add('editable-cell');
                        }
                    }
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            resultsTableContainer.appendChild(table);
        } else {
             resultsTableContainer.innerHTML = `<p class="no-data-message">${data.message || 'Summary data is shown in the left panel. No detailed records for this query.'}</p>`;
        }
        if(dashboardDataDisplay) { dashboardDataDisplay.style.opacity = '0'; setTimeout(() => { dashboardDataDisplay.style.opacity = '1'; }, 50); }
    }
    
    if (saveButton) {
        saveButton.addEventListener('click', async () => {
            saveButton.disabled = true;
            saveStatusMessage.textContent = 'Saving...';
            saveStatusMessage.className = 'saving';

            const dataToSave = [];
            const tableRows = document.querySelectorAll('#resultsTableContainer tbody tr');

            tableRows.forEach(row => {
                const statusElement = row.querySelector('[data-field="status"]');
                const rowData = {
                    palcode: row.dataset.palcode,
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
                const response = await fetch('/api/save_dashboard', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(dataToSave)
                });
                
                if (response.status === 401) { window.location.href = '/login'; return; }
                
                const result = await response.json();
                if (result.success) {
                    saveStatusMessage.textContent = result.message || 'Save Successful!';
                    saveStatusMessage.className = 'success';
                } else {
                    throw new Error(result.error || 'Unknown error occurred.');
                }
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