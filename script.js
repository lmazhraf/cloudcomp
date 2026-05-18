document.addEventListener('DOMContentLoaded', () => {
    // ==========================================================================
    // STATE & CONTEXT VARIABLES
    // ==========================================================================
    let tasks = [];
    let currentFilter = 'all';
    let searchQuery = '';

    // ==========================================================================
    // DOM ELEMENTS SELECTORS
    // ==========================================================================
    const taskForm = document.getElementById('task-creation-form');
    const inputName = document.getElementById('input-name');
    const inputTask = document.getElementById('input-task');
    const inputDate = document.getElementById('input-date');
    const inputStatus = document.getElementById('input-status');

    const searchInput = document.getElementById('search-input');
    const filterButtons = document.querySelectorAll('.tab-btn');
    const tasksCardsGrid = document.getElementById('tasks-cards-grid');

    // Counters and Progress Bar
    const progressBarFill = document.getElementById('progress-bar-fill');
    const progressPercentageText = document.getElementById('progress-percentage-text');
    const completedCounterText = document.getElementById('completed-counter-text');
    const totalCounterText = document.getElementById('total-counter-text');

    // Badges inside tabs
    const badgeAll = document.getElementById('badge-all');
    const badgeProgress = document.getElementById('badge-progress');
    const badgeDone = document.getElementById('badge-done');
    const badgeCancelled = document.getElementById('badge-cancelled');

    // Edit Modal Elements
    const editModal = document.getElementById('edit-task-modal');
    const editForm = document.getElementById('task-edit-form');
    const editTaskId = document.getElementById('edit-task-id');
    const editName = document.getElementById('edit-name');
    const editTaskDesc = document.getElementById('edit-task');
    const editDate = document.getElementById('edit-date');
    const editStatus = document.getElementById('edit-status');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnCancelEdit = document.getElementById('btn-cancel-edit');

    // Connection Status Indicator
    const connectionStatusDiv = document.getElementById('connection-status');

    // Set default date to today's date in local time zone
    const today = new Date().toISOString().split('T')[0];
    inputDate.value = today;


    // ==========================================================================
    // API CALLS ENGINE (AJAX via FETCH)
    // ==========================================================================
    const API_URL = 'index.php';

    // 1. Fetch all tasks from SQLite
    async function loadTasks() {
        showLoading(true);
        try {
            const response = await fetch(`${API_URL}?action=get_tasks`);
            if (!response.ok) throw new Error('Gagal mengambil data dari server');
            tasks = await response.json();
            
            // Map types from SQLite strings
            tasks = tasks.map(task => ({
                ...task,
                id: parseInt(task.id)
            }));

            updateDashboard();
        } catch (error) {
            console.error('Error loading tasks:', error);
            showErrorState('Koneksi Gagal', 'Gagal menyambung ke server database. Pastikan web server PHP berjalan dengan benar.');
        }
    }

    // 2. Add a new task
    async function addTask(newTaskPayload) {
        try {
            const response = await fetch(`${API_URL}?action=add_task`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newTaskPayload)
            });

            if (!response.ok) throw new Error('Gagal menambahkan tugas');
            const data = await response.json();
            
            if (data.success) {
                // Prepend new task to state
                tasks.unshift({
                    ...data.task,
                    id: parseInt(data.task.id)
                });
                
                // Clear input form
                inputTask.value = '';
                inputDate.value = today;
                inputStatus.value = 'on progress';
                
                updateDashboard();
            }
        } catch (error) {
            console.error('Error adding task:', error);
            alert('Gagal menyimpan tugas baru ke SQLite!');
        }
    }

    // 3. Update task status
    async function updateTaskStatus(id, newStatus) {
        // Optimistic UI update: instantly update frontend state for superior speed
        const originalTasks = JSON.parse(JSON.stringify(tasks));
        tasks = tasks.map(t => t.id === id ? { ...t, status: newStatus } : t);
        updateDashboard();

        try {
            const response = await fetch(`${API_URL}?action=update_status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status: newStatus })
            });

            if (!response.ok) throw new Error('Gagal merubah status tugas');
            const data = await response.json();
            if (!data.success) {
                // Rollback on server error
                tasks = originalTasks;
                updateDashboard();
                alert('Gagal memperbarui status tugas di server.');
            }
        } catch (error) {
            console.error('Error updating task status:', error);
            // Rollback on network failure
            tasks = originalTasks;
            updateDashboard();
            alert('Gagal menyambung ke server untuk memperbarui status.');
        }
    }

    // 4. Delete task
    async function deleteTask(id) {
        if (!confirm('Apakah Anda yakin ingin menghapus tugas ini?')) return;

        // Optimistic UI update
        const originalTasks = JSON.parse(JSON.stringify(tasks));
        tasks = tasks.filter(t => t.id !== id);
        updateDashboard();

        try {
            const response = await fetch(`${API_URL}?action=delete_task`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });

            if (!response.ok) throw new Error('Gagal menghapus tugas');
            const data = await response.json();
            if (!data.success) {
                // Rollback
                tasks = originalTasks;
                updateDashboard();
                alert('Gagal menghapus tugas di database server.');
            }
        } catch (error) {
            console.error('Error deleting task:', error);
            // Rollback
            tasks = originalTasks;
            updateDashboard();
            alert('Gagal menyambung ke server untuk menghapus tugas.');
        }
    }

    // 5. Edit task
    async function editTask(updatedTaskPayload) {
        try {
            const response = await fetch(`${API_URL}?action=edit_task`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedTaskPayload)
            });

            if (!response.ok) throw new Error('Gagal merubah data tugas');
            const data = await response.json();
            
            if (data.success) {
                // Update local state
                tasks = tasks.map(t => t.id === parseInt(data.task.id) ? {
                    ...t,
                    name: data.task.name,
                    task: data.task.task,
                    date: data.task.date,
                    status: data.task.status
                } : t);
                
                // Close modal and sync UI
                closeEditModal();
                updateDashboard();
            }
        } catch (error) {
            console.error('Error editing task:', error);
            alert('Gagal menyimpan perubahan tugas ke SQLite!');
        }
    }

    // Modal Helpers
    function openEditModal(task) {
        editTaskId.value = task.id;
        editName.value = task.name;
        editTaskDesc.value = task.task;
        editDate.value = task.date;
        editStatus.value = task.status;
        
        editModal.classList.add('show');
    }

    function closeEditModal() {
        editModal.classList.remove('show');
        editForm.reset();
    }

    // ==========================================================================
    // UI SYNCHRONIZATION & RENDERING
    // ==========================================================================
    function updateDashboard() {
        renderTasks();
        renderStats();
        drawChart();
    }

    // Render Stats and Progress
    function renderStats() {
        const total = tasks.length;
        const done = tasks.filter(t => t.status === 'done').length;
        const inProgress = tasks.filter(t => t.status === 'on progress').length;
        const cancelled = tasks.filter(t => t.status === 'cancelled').length;

        // Update counts badges
        badgeAll.textContent = total;
        badgeProgress.textContent = inProgress;
        badgeDone.textContent = done;
        badgeCancelled.textContent = cancelled;

        // Compute completion progress percentage
        const percent = total > 0 ? Math.round((done / total) * 100) : 0;
        progressBarFill.style.width = `${percent}%`;
        progressPercentageText.textContent = `${percent}%`;

        // Update textual counters
        completedCounterText.textContent = `${done} selesai`;
        totalCounterText.textContent = `${total} total tugas`;
    }

    // Render Task Cards with dynamic filters and searches
    function renderTasks() {
        tasksCardsGrid.innerHTML = '';

        // Filter and Search array
        const filtered = tasks.filter(t => {
            // Status Tab Filter
            if (currentFilter !== 'all' && t.status !== currentFilter) {
                return false;
            }
            // Search Query Filter (Matches Name or Task description)
            if (searchQuery !== '') {
                const term = searchQuery.toLowerCase();
                const nameMatch = t.name.toLowerCase().includes(term);
                const taskMatch = t.task.toLowerCase().includes(term);
                return nameMatch || taskMatch;
            }
            return true;
        });

        // Handle empty states
        if (filtered.length === 0) {
            showEmptyState();
            return;
        }

        // Render card elements
        filtered.forEach(task => {
            const card = document.createElement('div');
            card.className = 'task-card';
            card.dataset.id = task.id;

            // Generate initial initials for avatar
            const initials = task.name.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase();

            // Setup proper classes and text based on status
            let badgeClass = 'badge-progress';
            let badgeText = 'On Progress';
            let iconClass = 'fa-regular fa-clock';

            if (task.status === 'done') {
                badgeClass = 'badge-done';
                badgeText = 'Done';
                iconClass = 'fa-regular fa-circle-check';
            } else if (task.status === 'cancelled') {
                badgeClass = 'badge-cancelled';
                badgeText = 'Cancelled';
                iconClass = 'fa-regular fa-circle-xmark';
            }

            card.innerHTML = `
                <div class="card-top">
                    <div class="user-meta">
                        <div class="avatar-circle">${escapeHTML(initials)}</div>
                        <span class="user-name">${escapeHTML(task.name)}</span>
                    </div>
                    <p class="task-description">${escapeHTML(task.task)}</p>
                </div>
                <div class="card-bottom">
                    <div class="task-date">
                        <i class="fa-regular fa-calendar"></i>
                        <span>${formatDate(task.date)}</span>
                    </div>
                    <div class="card-actions">
                        <!-- Status Badge and Dropdown Picker -->
                        <div class="status-pill-container">
                            <div class="status-badge ${badgeClass}" title="Klik untuk mengubah status">
                                <i class="${iconClass}"></i>
                                <span>${badgeText}</span>
                                <i class="fa-solid fa-chevron-down"></i>
                            </div>
                            
                            <!-- Inline Dropdown Popover Menu -->
                            <div class="status-dropdown-menu">
                                <button class="dropdown-item text-primary" data-status="on progress">
                                    <i class="fa-regular fa-clock text-primary"></i> On Progress
                                </button>
                                <button class="dropdown-item text-success" data-status="done">
                                    <i class="fa-regular fa-circle-check text-success"></i> Done
                                </button>
                                <button class="dropdown-item text-danger" data-status="cancelled">
                                    <i class="fa-regular fa-circle-xmark text-danger"></i> Cancelled
                                </button>
                            </div>
                        </div>
                        
                        <!-- Edit Button -->
                        <button class="btn-action-edit" title="Edit Tugas">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        
                        <!-- Delete Button -->
                        <button class="btn-action-delete" title="Hapus Tugas">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>
            `;

            // EVENT LISTENERS INSIDE TASK CARD
            
            // Toggle Status Dropdown display
            const statusBadge = card.querySelector('.status-badge');
            const statusMenu = card.querySelector('.status-dropdown-menu');
            
            statusBadge.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close any other open dropdowns first
                document.querySelectorAll('.status-dropdown-menu.show').forEach(menu => {
                    if (menu !== statusMenu) menu.classList.remove('show');
                });
                statusMenu.classList.toggle('show');
            });

            // Handle dropdown item click
            statusMenu.querySelectorAll('.dropdown-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const selectedStatus = item.dataset.status;
                    statusMenu.classList.remove('show');
                    if (selectedStatus !== task.status) {
                        updateTaskStatus(task.id, selectedStatus);
                    }
                });
            });

            // Handle Edit Click
            const editBtn = card.querySelector('.btn-action-edit');
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openEditModal(task);
            });

            // Handle Delete Click
            const deleteBtn = card.querySelector('.btn-action-delete');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteTask(task.id);
            });

            tasksCardsGrid.appendChild(card);
        });
    }

    // Close status popover when clicking anywhere else
    document.addEventListener('click', () => {
        document.querySelectorAll('.status-dropdown-menu.show').forEach(menu => {
            menu.classList.remove('show');
        });
    });

    // ==========================================================================
    // CUSTOM CANVAS BAR CHART DRAWING ENGINE (VANILLA JS)
    // ==========================================================================
    function drawChart() {
        const canvas = document.getElementById('userTasksChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        // Set dimensions for high-DPI displays (retina rendering)
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const width = rect.width;
        const height = rect.height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        // Aggregate statistics of tasks count per unique user
        const userStats = {};
        tasks.forEach(t => {
            const userName = t.name.trim();
            userStats[userName] = (userStats[userName] || 0) + 1;
        });

        const users = Object.keys(userStats);
        const counts = Object.values(userStats);

        if (users.length === 0) {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '500 13px Outfit';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Belum ada tugas untuk divisualisasikan', width / 2, height / 2);
            return;
        }

        // Paddings and Chart boundary
        const paddingLeft = 45;
        const paddingRight = 20;
        const paddingTop = 30;
        const paddingBottom = 40;

        const chartWidth = width - paddingLeft - paddingRight;
        const chartHeight = height - paddingTop - paddingBottom;

        // Maximum Y limit setup
        const absoluteMax = Math.max(...counts);
        const maxCount = Math.max(absoluteMax, 4); // Always have at least 4 divisions
        const yTicks = 4;

        // Draw horizontal gridlines and Y-axis tick values
        ctx.strokeStyle = '#f1f5f9';
        ctx.lineWidth = 1.5;
        ctx.fillStyle = '#94a3b8';
        ctx.font = '600 10px Outfit';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';

        for (let i = 0; i <= yTicks; i++) {
            const tickValue = Math.round((maxCount / yTicks) * i);
            const y = height - paddingBottom - (chartHeight * (tickValue / maxCount));

            // Horizontal Grid Line
            ctx.beginPath();
            ctx.moveTo(paddingLeft, y);
            ctx.lineTo(width - paddingRight, y);
            ctx.stroke();

            // Y Axis Label
            ctx.fillText(tickValue.toString(), paddingLeft - 10, y);
        }

        // Draw Bars & X-axis Labels
        const barSpacing = 20;
        const totalSpacingWidth = barSpacing * (users.length - 1);
        const barWidth = Math.max((chartWidth - totalSpacingWidth) / users.length, 12);

        users.forEach((user, index) => {
            const taskCount = userStats[user];
            const barHeight = chartHeight * (taskCount / maxCount);
            
            const x = paddingLeft + index * (barWidth + barSpacing);
            const y = height - paddingBottom - barHeight;

            // Draw Rounded bar gradient
            const gradient = ctx.createLinearGradient(x, y, x, y + barHeight);
            gradient.addColorStop(0, '#3b82f6'); // bright blue
            gradient.addColorStop(1, '#2563eb'); // deep cobalt
            ctx.fillStyle = gradient;

            // Render modern rounded corner top using path
            const radius = Math.min(6, barHeight > 0 ? barHeight : 0);
            ctx.beginPath();
            ctx.moveTo(x, y + barHeight);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.lineTo(x + barWidth - radius, y);
            ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
            ctx.lineTo(x + barWidth, y + barHeight);
            ctx.closePath();
            ctx.fill();

            // Task quantity count labels above bar
            ctx.fillStyle = '#0f172a';
            ctx.font = '700 11px Outfit';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(taskCount.toString(), x + barWidth / 2, y - 4);

            // User Name under bar on X-axis (only first name to make it extremely tidy and prevent overlap)
            ctx.fillStyle = '#475569';
            ctx.font = '600 10px Outfit';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            let label = user.split(' ')[0];
            if (label.length > 10) {
                label = label.substring(0, 9) + '..';
            }
            ctx.fillText(label, x + barWidth / 2, height - paddingBottom + 8);
        });
    }

    // Redraw canvas on window resize to remain fully responsive
    window.addEventListener('resize', drawChart);

    // ==========================================================================
    // EVENT LISTENERS & SEARCH HANDLERS
    // ==========================================================================

    // Handle Task Form Submit Creation
    taskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const nameVal = inputName.value.trim();
        const taskVal = inputTask.value.trim();
        const dateVal = inputDate.value;
        const statusVal = inputStatus.value;

        if (nameVal && taskVal && dateVal && statusVal) {
            addTask({
                name: nameVal,
                task: taskVal,
                date: dateVal,
                status: statusVal
            });
        }
    });

    // Handle Real-time Search input
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderTasks();
    });

    // Handle Filter tab selection click
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active classes
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            currentFilter = btn.dataset.filter;
            renderTasks();
        });
    });

    // Connection Monitor Logic
    function updateConnectionStatus() {
        if (navigator.onLine) {
            connectionStatusDiv.className = 'connection-status online';
            connectionStatusDiv.querySelector('.status-text').textContent = 'Online';
        } else {
            connectionStatusDiv.className = 'connection-status offline';
            connectionStatusDiv.querySelector('.status-text').textContent = 'Offline';
        }
    }

    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
    // Trigger once initially
    updateConnectionStatus();

    // Handle Edit Modal Close Events
    btnCloseModal.addEventListener('click', closeEditModal);
    btnCancelEdit.addEventListener('click', closeEditModal);
    
    // Close modal when clicking outside of the content (on overlay)
    editModal.addEventListener('click', (e) => {
        if (e.target === editModal) {
            closeEditModal();
        }
    });

    // Handle Edit Task Form Submit
    editForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const idVal = parseInt(editTaskId.value);
        const nameVal = editName.value.trim();
        const taskVal = editTaskDesc.value.trim();
        const dateVal = editDate.value;
        const statusVal = editStatus.value;

        if (idVal && nameVal && taskVal && dateVal && statusVal) {
            editTask({
                id: idVal,
                name: nameVal,
                task: taskVal,
                date: dateVal,
                status: statusVal
            });
        }
    });

    // ==========================================================================
    // PLACEHOLDER STATE ASSISTANT HELPERS
    // ==========================================================================
    function showLoading(isLoading) {
        if (isLoading) {
            tasksCardsGrid.innerHTML = `
                <div id="loading-state" class="state-placeholder">
                    <i class="fa-solid fa-circle-notch fa-spin text-primary loader-icon"></i>
                    <p>Mengambil data dari server...</p>
                </div>
            `;
        }
    }

    function showEmptyState() {
        tasksCardsGrid.innerHTML = `
            <div class="state-placeholder">
                <i class="fa-regular fa-folder-open empty-icon"></i>
                <p>Tidak ditemukan tugas yang sesuai.</p>
                <span class="subtitle">Cobalah ubah filter status atau buat tugas baru!</span>
            </div>
        `;
    }

    function showErrorState(title, description) {
        tasksCardsGrid.innerHTML = `
            <div class="state-placeholder">
                <i class="fa-solid fa-triangle-exclamation text-danger empty-icon"></i>
                <h3 style="font-weight:700; font-size:1.15rem; color:var(--text-primary); margin-top:0.5rem;">${title}</h3>
                <p class="subtitle" style="max-width: 320px; margin: 0.25rem auto 0 auto;">${description}</p>
            </div>
        `;
    }

    // ==========================================================================
    // UTILITY HELPER FUNCTIONS (SANITIZATION & FORMATTING)
    // ==========================================================================
    function escapeHTML(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Convert dates from YYYY-MM-DD to beautiful localized format "18 Mei 2026"
    function formatDate(dateStr) {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;

        const months = [
            'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
            'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'
        ];

        const year = parts[0];
        const monthIndex = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);

        return `${day} ${months[monthIndex]} ${year}`;
    }

    // ==========================================================================
    // INITIAL BOOTSTRAP TRIGGER
    // ==========================================================================
    loadTasks();
});
