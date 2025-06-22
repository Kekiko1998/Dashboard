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
    // Payout Form Elements
    const payoutForm = document.getElementById('payoutForm');
    const uploadButton = document.getElementById('uploadButton');
    const uploadStatusMessage = document.getElementById('uploadStatusMessage');
    const payoutImageInput = document.getElementById('payoutImage');
    const imagePreviewContainer = document.getElementById('imagePreviewContainer');
    const imagePreview = document.getElementById('imagePreview');
    const payoutBaNameInput = document.getElementById('payoutBaName');
    // Flip Card Elements
    const payoutInfoFlipCard = document.getElementById('payoutInfoFlipCard');
    const payoutFrontInfo = document.getElementById('payoutFrontInfo');
    const payoutQrCodeContainer = document.getElementById('payoutQrCodeContainer');

    // --- State Variables ---
    let isAdmin = false;
    let userPermissions = new Set();
    let selectedBaNamesState = [];
    const statusOptions = ['PAID', 'DELAYED', 'UPDATING', 'INVALID', 'UNOFFICIAL'];

    // --- Initial Data Fetching & UI Setup ---
    function setupUIForUser(userInfo) {
        isAdmin = userInfo.isAdmin;
        userPermissions = new Set(userInfo.permissions);
        userNameSpan.textContent = userInfo.name;
        userInfoDiv.style.display = 'flex';

        if (payoutBaNameInput) {
            payoutBaNameInput.value = userInfo.name || '';
        }
        
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

    // --- Special User UI Transformation Functions (Tag-based) ---
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
        baNameInput.removeAttribute('list');
        selectedBaNamesState.forEach(name => addTag(name, false));
        updateVisibleTags();
        baNameInput.addEventListener('keydown', handleMultiSelectKeyDown);
        wrapper.addEventListener('click', () => baNameInput.focus());
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
        baNameInput.setAttribute('list', 'baNameSuggestions');
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
            if (selectedBaNamesState.map(n => n.toLowerCase()).includes(lowerCaseName)) return;
            selectedBaNamesState.push(name);
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
    if (localStorage.getItem('dashboardTheme') === 'light') { setDarkMode(false); } else { setDarkMode(true); }

    window.showTab = function(tabId, clickedButton) {
        document.querySelectorAll(".tab-content").forEach(tab => tab.classList.remove('active-content'));
        document.querySelectorAll(".tab-button").forEach(btn => btn.classList.remove("active"));
        document.getElementById(tabId).classList.add('active-content');
        clickedButton.classList.add("active");

        if (tabId !== 'homeArea') {
            topLeftDynamicContent.appendChild(homeTitleContainer);
            topLeftDynamicContent.appendChild(homeSearchControlsContainer);
            if (userPermissions.has('MULTI_SELECT')) switchToSimpleView();
        } else {
            homeContentCentered.appendChild(homeTitleContainer);
            homeContentCentered.appendChild(homeSearchControlsContainer);
            if (userPermissions.has('MULTI_SELECT')) switchToMultiSelectView();
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
    // ... (This entire section is correct and unchanged)

    // --- Payout Form & Flip Card Logic ---
    function loadPayoutInfoCard() {
        fetch('/api/get_payout_info')
            .then(res => res.json())
            .then(payoutData => {
                if (payoutData.found && payoutData.data) {
                    const info = payoutData.data;
                    payoutFrontInfo.innerHTML = `<div><strong>BA Name:</strong> ${info.ba_name}</div><div><strong>Acct. Name:</strong> ${info.mop_account_name}</div><div><strong>Number:</strong> ${info.mop_number}</div>`;
                    if (info.drive_file_id) {
                        payoutQrCodeContainer.innerHTML = `<img src="https://drive.google.com/uc?export=view&id=${info.drive_file_id}" alt="QR Code">`;
                    } else {
                        payoutQrCodeContainer.innerHTML = `<p>No QR Image found.</p>`;
                    }
                    payoutInfoFlipCard.style.display = 'block';
                } else {
                    payoutInfoFlipCard.style.display = 'none';
                }
            })
            .catch(error => {
                console.error("Failed to load payout info:", error);
                payoutInfoFlipCard.style.display = 'none';
            });
    }

    if (payoutImageInput) {
        payoutImageInput.addEventListener('change', function() {
            if (uploadStatusMessage) uploadStatusMessage.textContent = '';
            const file = this.files[0];
            if (file) {
                if (file.size > 5 * 1024 * 1024) {
                    alert('Error: File size exceeds 5MB limit.');
                    this.value = '';
                    imagePreviewContainer.style.display = 'none';
                    return;
                }
                if (!['image/jpeg', 'image/png'].includes(file.type)) {
                    alert('Error: Only JPEG and PNG files are allowed.');
                    this.value = '';
                    imagePreviewContainer.style.display = 'none';
                    return;
                }
                const reader = new FileReader();
                reader.onload = function(e) {
                    imagePreview.src = e.target.result;
                    imagePreviewContainer.style.display = 'block';
                }
                reader.readAsDataURL(file);
            } else {
                imagePreviewContainer.style.display = 'none';
            }
        });
    }

    if (payoutForm) {
        payoutForm.addEventListener('submit', function(e) {
            e.preventDefault();
            uploadButton.disabled = true;
            uploadButton.textContent = 'UPLOADING...';
            uploadStatusMessage.textContent = 'Processing upload, please wait...';
            uploadStatusMessage.className = 'upload-status-message saving';
            const formData = new FormData(this);
            fetch('/api/upload_payout_info', {
                method: 'POST',
                body: formData
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    uploadStatusMessage.textContent = data.message;
                    uploadStatusMessage.className = 'upload-status-message success';
                    payoutForm.reset();
                    imagePreviewContainer.style.display = 'none';
                    if(payoutBaNameInput) payoutBaNameInput.value = userNameSpan.textContent || '';
                } else {
                    throw new Error(data.error);
                }
            })
            .catch(error => {
                uploadStatusMessage.textContent = `Error: ${error.message}`;
                uploadStatusMessage.className = 'upload-status-message error';
            })
            .finally(() => {
                uploadButton.disabled = false;
                uploadButton.textContent = 'Upload Information';
            });
        });
    }

    // --- Search & Data Handling ---
    function performSearch() {
        const month = monthSelect.value, week = weekSelect.value, palcode = palcodeInput.value.trim();
        let baNamesToSearch = [];
        const baNameInputValue = document.getElementById('baNameInput').value.trim();
        if (userPermissions.has('MULTI_SELECT')) {
            if (document.getElementById('baNameMultiSelectWrapper')) {
                if (baNameInputValue !== '') { addTag(baNameInputValue, true); document.getElementById('baNameInput').value = ''; }
                baNamesToSearch = selectedBaNamesState;
            } else {
                if(baNameInputValue) baNamesToSearch.push(baNameInputValue);
            }
        } else {
             if(baNameInputValue) baNamesToSearch.push(baNameInputValue);
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
            dashboardSearchError.style.display = 'none'; 
            populateDashboardWithData(data); 
            loadPayoutInfoCard();
            dashboardDataDisplay.style.display = 'flex';
        } else {
            dashboardSearchError.querySelector('p').textContent = `⚠️ ${data.message || 'No data found for this query.'}`;
            dashboardSearchError.style.display = 'flex'; 
            dashboardDataDisplay.style.display = 'none';
        }
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