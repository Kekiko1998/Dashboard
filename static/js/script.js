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

    // All other element selectors are correct, no changes needed here.
    
    let isSpecialUser = false;
    let selectedBaNamesState = [];

    // --- Special User UI Functions (No changes needed here) ---
    function switchToMultiSelectView() {
        if (document.getElementById('baNameMultiSelectWrapper')) return;
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
    
    // --- Initial Data Fetching ---
    function setupUIForUser(userInfo) {
        isSpecialUser = userInfo.isSpecial;
        userNameSpan.textContent = userInfo.name;
        userInfoDiv.style.display = 'flex';
        const activeTabButton = document.querySelector('.tab-button.active');
        if (isSpecialUser && activeTabButton && activeTabButton.id === 'homeTabBtn') {
            switchToMultiSelectView();
        }
    }
    fetch('/api/user-info').then(res => {
        if (res.ok) return res.json();
        window.location.href = '/login'; 
    }).then(userInfo => {
        if (userInfo) {
            setupUIForUser(userInfo);
            populateBaNameSuggestions();
        }
    }).catch(err => {
        console.error("Could not fetch user info:", err);
        window.location.href = '/login';
    });
    
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
    
    // --- UI Management ---
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
            if (isSpecialUser) switchToMultiSelectView();
        } else {
            topLeftDynamicContent.appendChild(homeTitleContainer);
            topLeftDynamicContent.appendChild(homeSearchControlsContainer);
            if (isSpecialUser) switchToSimpleView();
        }
    };

    if (searchButton) {
        searchButton.addEventListener('click', function() {
            const month = monthSelect.value;
            const week = weekSelect.value;
            const palcode = palcodeInput.value.trim();
            let baNamesToSearch;
            const baNameInputValue = document.getElementById('baNameInput').value.trim();
            if (isSpecialUser) {
                if (document.getElementById('baNameMultiSelectWrapper')) {
                    if (baNameInputValue !== '') {
                        addTag(baNameInputValue, true);
                        document.getElementById('baNameInput').value = ''; 
                    }
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
            if (!isSpecialUser && baNamesToSearch.length === 0) {
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
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(searchPayload),
            })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(errorData => {
                        throw new Error(errorData.error || `Server error: ${response.status}`);
                    });
                }
                return response.json();
            })
            .then(data => handleSearchSuccess(data))
            .catch(error => handleSearchFailure(error));
        });
    }

    // --- Data Handling and Display Functions ---
    function handleSearchSuccess(data) {
        searchButton.disabled = false;
        searchButton.textContent = 'SEARCH';
        loadingIndicator.style.display = 'none';
        
        if (data.error || (!data.resultsTable && !data.summary)) {
            dashboardSearchError.querySelector('p').textContent = `⚠️ ${data.error || 'An unknown error occurred.'}`;
            dashboardSearchError.style.display = 'flex';
            dashboardDataDisplay.style.display = 'none';
            return;
        }
        const hasData = (data.resultsTable && data.resultsTable.length > 0) || (data.summary && data.summary.totalValidFd > 0);
        if (hasData) {
            dashboardSearchError.style.display = 'none';
            populateDashboardWithData(data);
            dashboardDataDisplay.style.display = 'flex';
        } else {
            dashboardSearchError.querySelector('p').textContent = `⚠️ ${data.message || 'No data found for this query.'}`;
            dashboardSearchError.style.display = 'flex';
            dashboardDataDisplay.style.display = 'none';
        }
    }

    function handleSearchFailure(error) {
        searchButton.disabled = false;
        searchButton.textContent = 'SEARCH';
        loadingIndicator.style.display = 'none';
        dashboardSearchError.querySelector('p').textContent = `❌ Script Error: ${error.message || 'Unknown error.'}`;
        dashboardSearchError.style.display = 'flex';
        dashboardDataDisplay.style.display = 'none';
        console.error("Server Call Error:", error);
    }
    
    function determineSummaryStatus(tableData) {
        const statusColumnIndex = 9;
        if (!tableData || tableData.length === 0) return { text: 'N/A', class: '' };
        const statuses = new Set(tableData.map(row => row[statusColumnIndex]?.toString().trim().toLowerCase()).filter(Boolean));
        if (statuses.size === 0) return { text: 'N/A', class: '' };
        if (statuses.size === 1) {
            const singleStatus = statuses.values().next().value;
            const formattedText = singleStatus.replace(/-/g, ' ').toUpperCase();
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

    // ===============================================================
    // --- THIS IS THE CORRECTED populateDashboardWithData FUNCTION ---
    // ===============================================================
    function populateDashboardWithData(data) {
        const baNameDisplay = document.getElementById('baNameDisplay');
        const totalRegistrationValue = document.getElementById('totalRegistrationValue');
        const totalValidFdValue = document.getElementById('totalValidFdValue');
        const totalSuspendedValue = document.getElementById('totalSuspendedValue');
        const totalSalaryValue = document.getElementById('totalSalaryValue');
        const totalIncentiveValue = document.getElementById('totalIncentiveValue');
        const monthDisplay = document.getElementById('monthDisplay');
        const weekDisplay = document.getElementById('weekDisplay');
        const dateRangeDisplay = document.getElementById('dateRangeDisplay');
        const statusValue = document.getElementById('statusValue');
        const lastUpdateValue = document.getElementById('lastUpdateValue'); // Correctly get the element
        const baRankingListDiv = document.getElementById('baRankingList');
        const resultsTableContainer = document.getElementById('resultsTableContainer');

        if(baNameDisplay) {
            baNameDisplay.innerHTML = '';
            baNameDisplay.className = 'ba-name-display';
            const selectedNames = data.searchCriteria?.baNames || [];
            if (selectedNames.length > 1 && isSpecialUser) { 
                baNameDisplay.classList.add('multi-select-display');
                const namesContainer = document.createElement('div');
                namesContainer.className = 'ba-name-scroll-content';
                const appendNames = () => {
                    selectedNames.forEach((name, index) => {
                        const nameSpan = document.createElement('span');
                        nameSpan.className = 'ba-name-scroll-item';
                        nameSpan.textContent = name;
                        namesContainer.appendChild(nameSpan);

                        if (index < selectedNames.length - 1 || selectedNames.length > 1) {
                             const separatorSpan = document.createElement('span');
                             separatorSpan.className = 'ba-name-scroll-separator';
                             separatorSpan.textContent = '•';
                             namesContainer.appendChild(separatorSpan);
                        }
                    });
                };
                appendNames();
                appendNames();
                const animationDuration = selectedNames.length * 3;
                namesContainer.style.animation = `marquee-scroll ${animationDuration}s linear infinite`;
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
        
        if(monthDisplay) monthDisplay.textContent = data.monthDisplay || "N/A";
        if(weekDisplay) weekDisplay.textContent = data.weekDisplay || "N/A";
        if(dateRangeDisplay) dateRangeDisplay.textContent = data.dateRangeDisplay || ""; 
        
        if (statusValue) {
            const summaryStatus = determineSummaryStatus(data.resultsTable);
            statusValue.textContent = summaryStatus.text;
            statusValue.className = summaryStatus.class;
        }

        // --- THIS IS THE FIX ---
        if(lastUpdateValue) {
            lastUpdateValue.textContent = data.lastUpdate || "N/A";
        }
        // -----------------------
        
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
                    itemDiv.appendChild(rankSpan);
                    itemDiv.appendChild(nameSpan);
                    itemDiv.appendChild(fdSpan);
                    baRankingListDiv.appendChild(itemDiv);
                });
            } else {
                baRankingListDiv.innerHTML = '<p style="text-align:center; font-size:0.8em; color:var(--text-color-subtle);">No BA ranking data available.</p>';
            }
        }

        if(resultsTableContainer) {
            resultsTableContainer.innerHTML = '';
            if (data.resultsTable && data.resultsTable.length > 0) {
                const table = document.createElement('table');
                const thead = document.createElement('thead');
                const tbody = document.createElement('tbody');
                const headerRow = document.createElement('tr');
                const headers = ['PALCODE','BA Name','REG','Valid FD','Suspended FD','Rate','GGR Per FD','Total GGR','SALARY','Status'];
                const thNo = document.createElement('th'); thNo.textContent = 'No.'; headerRow.appendChild(thNo);
                headers.forEach(text => { const th = document.createElement('th'); th.textContent = text.toUpperCase(); headerRow.appendChild(th); });
                thead.appendChild(headerRow); table.appendChild(thead);
                const statusColumnDataIndex = 9; 
                const rippleDelayIncrement = 0.05;
                data.resultsTable.forEach((rowData, rowIndex) => {
                    const tr = document.createElement('tr');
                    tr.classList.add('result-row-animate'); tr.style.animationDelay = `${rowIndex * rippleDelayIncrement}s`;
                    const tdNo = document.createElement('td'); tdNo.textContent = rowIndex + 1; tr.appendChild(tdNo);
                    rowData.forEach((cellData, cellIndex) => {
                        const td = document.createElement('td');
                        const formattedCell = (cellData === null || cellData === undefined) ? '' : cellData;
                        td.textContent = formattedCell;
                        if (cellIndex === statusColumnDataIndex) {
                            let statusClass = '';
                            const statusText = formattedCell.toString().trim().toLowerCase().replace(/\s+/g, '-');
                            switch (statusText) {
                                case 'paid': statusClass = 'status-paid'; break;
                                case 'on-going': statusClass = 'status-on-going'; break;
                                case 'delayed': statusClass = 'status-delayed'; break;
                                case 'updating': statusClass = 'status-updating'; break;
                                case 'invalid': statusClass = 'status-invalid'; break;
                                case 'unofficial': statusClass = 'status-unofficial'; break;
                            }
                            if (statusClass) td.classList.add(statusClass);
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
        }

        if(dashboardDataDisplay) {
            dashboardDataDisplay.style.opacity = '0';
             setTimeout(() => {
                dashboardDataDisplay.style.opacity = '1';
            }, 50);
        }
    }
    // ===============================================================
    
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
                if (progress >= 1) {
                    displayValue = `₱ ${parseFloat(end).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
                }
            } else {
                displayValue = currentValue.toLocaleString();
                 if (progress >= 1) {
                    displayValue = end.toLocaleString();
                }
            }
            element.textContent = displayValue;
            if (progress < 1) { window.requestAnimationFrame(step); }
        };
        window.requestAnimationFrame(step);
    }
});