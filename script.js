document.addEventListener('DOMContentLoaded', () => {
    // ==========================================================================
    // STATE & CONTEXT VARIABLES
    // ==========================================================================
    let tasks = [];
    let currentFilter = 'all';
    let currentCategoryFilter = 'all';
    let currentSort = 'newest';
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

    // Theme Selector Toggle
    const themeToggleBtn = document.getElementById('theme-toggle-btn');

    // Sort Selector
    const sortSelect = document.getElementById('sort-select');

    // Set default date to today's date in local time zone
    const today = new Date().toISOString().split('T')[0];
    inputDate.value = today;


    // ==========================================================================
    // DARK / LIGHT THEME TOGGLE STUFF
    // ==========================================================================
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        themeToggleBtn.querySelector('i').className = 'fa-solid fa-sun';
    }

    themeToggleBtn.addEventListener('click', () => {
        const isDark = document.body.classList.toggle('dark-theme');
        if (isDark) {
            localStorage.setItem('theme', 'dark');
            themeToggleBtn.querySelector('i').className = 'fa-solid fa-sun';
        } else {
            localStorage.setItem('theme', 'light');
            themeToggleBtn.querySelector('i').className = 'fa-solid fa-moon';
        }
        // Redraw canvas to update colors in dark theme
        drawChart();
    });


    // ==========================================================================
    // SUBTASK BUILDER LOGIC (CREATE & EDIT)
    // ==========================================================================
    function addSubtaskRow(type, text = '', completed = false) {
        const container = document.getElementById(`subtask-list-${type}`);
        if (!container) return;

        const row = document.createElement('div');
        row.className = 'subtask-input-row';
        row.innerHTML = `
            <input 
                type="text" 
                class="subtask-input-item" 
                placeholder="Detail sub-tugas..." 
                required 
                maxlength="100" 
                value="${escapeHTML(text)}"
                data-completed="${completed}"
            >
            <button type="button" class="btn-remove-subtask-row" title="Hapus Sub-tugas">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        `;

        // Bind delete action
        row.querySelector('.btn-remove-subtask-row').addEventListener('click', () => {
            row.remove();
        });

        container.appendChild(row);
    }

    document.getElementById('btn-add-subtask-create').addEventListener('click', () => {
        addSubtaskRow('create');
    });

    document.getElementById('btn-add-subtask-edit').addEventListener('click', () => {
        addSubtaskRow('edit');
    });


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
                id: parseInt(task.id),
                subtasks: Array.isArray(task.subtasks) ? task.subtasks : []
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
                    id: parseInt(data.task.id),
                    subtasks: Array.isArray(data.task.subtasks) ? data.task.subtasks : []
                });
                
                // Clear input form
                inputTask.value = '';
                inputDate.value = today;
                inputStatus.value = 'on progress';

                // Reset priority selection to Sedang
                document.querySelector('input[name="create-priority"][value="Sedang"]').checked = true;
                
                // Reset category selection to Lainnya
                document.querySelector('input[name="create-category"][value="Lainnya"]').checked = true;

                // Clear subtasks list builder
                document.getElementById('subtask-list-create').innerHTML = '';
                
                // Trigger confetti if status is done
                if (data.task.status === 'done') {
                    triggerConfetti();
                }

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

        if (newStatus === 'done') {
            triggerConfetti();
        }

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

    // 3b. Update subtasks status (persistent checkbox change)
    async function updateSubtaskStatus(id, subtasksList) {
        try {
            const response = await fetch(`${API_URL}?action=update_subtasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, subtasks: subtasksList })
            });

            if (!response.ok) throw new Error('Gagal merubah status sub-tugas');
            const data = await response.json();
            if (data.success) {
                // Keep local state in sync
                tasks = tasks.map(t => t.id === id ? { ...t, subtasks: data.subtasks } : t);
                renderStats();
            }
        } catch (error) {
            console.error('Error updating subtasks:', error);
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
                    status: data.task.status,
                    priority: data.task.priority,
                    category: data.task.category,
                    subtasks: Array.isArray(data.task.subtasks) ? data.task.subtasks : []
                } : t);
                
                // Trigger confetti if changed to done
                if (data.task.status === 'done') {
                    triggerConfetti();
                }

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
        
        // Priority
        const priorityInput = document.querySelector(`input[name="edit-priority"][value="${task.priority || 'Sedang'}"]`);
        if (priorityInput) priorityInput.checked = true;

        // Category
        const categoryInput = document.querySelector(`input[name="edit-category"][value="${task.category || 'Lainnya'}"]`);
        if (categoryInput) categoryInput.checked = true;

        // Populate subtasks in builder list
        const subtaskListEdit = document.getElementById('subtask-list-edit');
        subtaskListEdit.innerHTML = '';
        if (task.subtasks && Array.isArray(task.subtasks)) {
            task.subtasks.forEach(s => {
                addSubtaskRow('edit', s.text, s.completed);
            });
        }
        
        editModal.classList.add('show');
    }

    function closeEditModal() {
        editModal.classList.remove('show');
        editForm.reset();
        document.getElementById('subtask-list-edit').innerHTML = '';
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

    // Render Task Cards with dynamic filters, categories, and searches
    function renderTasks() {
        tasksCardsGrid.innerHTML = '';

        // Filter and Search array
        let filtered = tasks.filter(t => {
            // Status Tab Filter
            if (currentFilter !== 'all' && t.status !== currentFilter) {
                return false;
            }
            // Category Tab Filter
            if (currentCategoryFilter !== 'all' && t.category !== currentCategoryFilter) {
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

        // Sorting
        const priorityWeight = { 'Tinggi': 3, 'Sedang': 2, 'Rendah': 1 };
        if (currentSort === 'newest') {
            filtered.sort((a, b) => b.id - a.id);
        } else if (currentSort === 'oldest') {
            filtered.sort((a, b) => a.id - b.id);
        } else if (currentSort === 'due_soon') {
            filtered.sort((a, b) => new Date(a.date) - new Date(b.date));
        } else if (currentSort === 'priority_desc') {
            filtered.sort((a, b) => {
                const wA = priorityWeight[a.priority] || 2;
                const wB = priorityWeight[b.priority] || 2;
                if (wB !== wA) return wB - wA;
                return b.id - a.id; // secondary sort newest
            });
        }

        // Handle empty states
        if (filtered.length === 0) {
            showEmptyState();
            return;
        }

        // Render card elements
        filtered.forEach(task => {
            const card = document.createElement('div');
            // Border left strip based on priority
            card.className = `task-card priority-${task.priority || 'Sedang'}`;
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

            // Category Icon mapping
            let categoryIcon = '<i class="fa-solid fa-tag"></i> Umum';
            if (task.category === 'Kuliah') {
                categoryIcon = '<i class="fa-solid fa-graduation-cap"></i> Kuliah';
            } else if (task.category === 'Kerja') {
                categoryIcon = '<i class="fa-solid fa-briefcase"></i> Kerja';
            } else if (task.category === 'Pribadi') {
                categoryIcon = '<i class="fa-solid fa-user"></i> Pribadi';
            }

            // Check if task is overdue
            let overdueBadge = '';
            if (task.status !== 'done' && task.date < today) {
                overdueBadge = `<span class="overdue-badge"><i class="fa-solid fa-triangle-exclamation"></i> Terlambat</span>`;
            }

            // Subtasks HTML construction
            let subtasksHTML = '';
            if (task.subtasks && task.subtasks.length > 0) {
                const totalSubs = task.subtasks.length;
                const completedSubs = task.subtasks.filter(s => s.completed).length;
                const percent = Math.round((completedSubs / totalSubs) * 100);

                subtasksHTML = `
                    <div class="task-card-subtasks">
                        <div class="subtask-progress-mini">
                            <span>Sub-tugas: ${completedSubs}/${totalSubs} (${percent}%)</span>
                            <div class="subtask-progress-bar">
                                <div class="subtask-progress-fill" style="width: ${percent}%;"></div>
                            </div>
                        </div>
                        <div class="subtasks-checklist">
                            ${task.subtasks.map((sub, idx) => `
                                <label class="subtask-item">
                                    <input type="checkbox" class="subtask-checkbox" data-index="${idx}" ${sub.completed ? 'checked' : ''}>
                                    <span>${escapeHTML(sub.text)}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                `;
            }

            card.innerHTML = `
                <div class="card-top">
                    <div class="card-meta-badges">
                        <span class="meta-badge priority-${(task.priority || 'sedang').toLowerCase()}">${task.priority || 'Sedang'}</span>
                        <span class="meta-badge category-tag">${categoryIcon}</span>
                        ${overdueBadge}
                    </div>
                    <div class="user-meta">
                        <div class="avatar-circle">${escapeHTML(initials)}</div>
                        <span class="user-name">${escapeHTML(task.name)}</span>
                    </div>
                    <p class="task-description">${escapeHTML(task.task)}</p>
                    ${subtasksHTML}
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

            // Handle Subtasks Checkbox toggles
            card.querySelectorAll('.subtask-checkbox').forEach(cb => {
                cb.addEventListener('change', (e) => {
                    const idx = parseInt(cb.dataset.index);
                    const updatedSubtasks = [...task.subtasks];
                    updatedSubtasks[idx].completed = cb.checked;
                    
                    // Optimistic UI updates of progress bar inside this card
                    const completedSubs = updatedSubtasks.filter(s => s.completed).length;
                    const totalSubs = updatedSubtasks.length;
                    const newPercent = Math.round((completedSubs / totalSubs) * 100);
                    
                    const percentText = card.querySelector('.subtask-progress-mini span');
                    if (percentText) {
                        percentText.textContent = `Sub-tugas: ${completedSubs}/${totalSubs} (${newPercent}%)`;
                    }
                    const progressFill = card.querySelector('.subtask-progress-fill');
                    if (progressFill) {
                        progressFill.style.width = `${newPercent}%`;
                    }

                    // Save to DB
                    updateSubtaskStatus(task.id, updatedSubtasks);
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
    // LIGHTWEIGHT CONFETTI PARTICLE SYSTEM (VANILLA JS ENGINE)
    // ==========================================================================
    function triggerConfetti() {
        const canvas = document.getElementById('confetti-canvas');
        if (!canvas) return;
        canvas.style.display = 'block';
        const ctx = canvas.getContext('2d');
        
        let width = canvas.width = window.innerWidth;
        let height = canvas.height = window.innerHeight;
        
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
        const particles = [];
        
        // Spawn particles
        for (let i = 0; i < 90; i++) {
            particles.push({
                x: width / 2,
                y: height + 20,
                vx: (Math.random() - 0.5) * 18,
                vy: -Math.random() * 16 - 12,
                size: Math.random() * 7 + 4,
                color: colors[Math.floor(Math.random() * colors.length)],
                rotation: Math.random() * 360,
                rotationSpeed: (Math.random() - 0.5) * 8
            });
        }
        
        let animationFrame;
        function update() {
            ctx.clearRect(0, 0, width, height);
            let active = false;
            
            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.45; // gravity simulation
                p.vx *= 0.98; // air drag
                p.rotation += p.rotationSpeed;
                
                if (p.y < height + 20) {
                    active = true;
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rotation * Math.PI / 180);
                    ctx.fillStyle = p.color;
                    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
                    ctx.restore();
                }
            });
            
            if (active) {
                animationFrame = requestAnimationFrame(update);
            } else {
                canvas.style.display = 'none';
                cancelAnimationFrame(animationFrame);
            }
        }
        
        animationFrame = requestAnimationFrame(update);
    }


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

        // UI color updates based on Dark/Light theme
        const isDark = document.body.classList.contains('dark-theme');
        const gridColor = isDark ? '#334155' : '#f1f5f9';
        const labelColor = isDark ? '#94a3b8' : '#64748b';
        const countTextColor = isDark ? '#f8fafc' : '#0f172a';

        if (users.length === 0) {
            ctx.fillStyle = labelColor;
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
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1.5;
        ctx.fillStyle = labelColor;
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

            // Render rounded corner top
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
            ctx.fillStyle = countTextColor;
            ctx.font = '700 11px Outfit';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(taskCount.toString(), x + barWidth / 2, y - 4);

            // User Name under bar on X-axis (only first name)
            ctx.fillStyle = labelColor;
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
    // EVENT LISTENERS & SEARCH/SORT/FILTER HANDLERS
    // ==========================================================================

    // Handle Task Form Submit Creation
    taskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const nameVal = inputName.value.trim();
        const taskVal = inputTask.value.trim();
        const dateVal = inputDate.value;
        const statusVal = inputStatus.value;

        // Get values from pills selectors
        const priorityVal = document.querySelector('input[name="create-priority"]:checked').value;
        const categoryVal = document.querySelector('input[name="create-category"]:checked').value;

        // Collect subtasks from builder list
        const subtasksList = [];
        document.querySelectorAll('#subtask-list-create .subtask-input-item').forEach(input => {
            subtasksList.push({
                text: input.value.trim(),
                completed: false
            });
        });

        if (nameVal && taskVal && dateVal && statusVal) {
            addTask({
                name: nameVal,
                task: taskVal,
                date: dateVal,
                status: statusVal,
                priority: priorityVal,
                category: categoryVal,
                subtasks: subtasksList
            });
        }
    });

    // Handle Real-time Search input
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderTasks();
    });

    // Handle Sorting select
    sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        renderTasks();
    });

    // Handle Category Filter Tabs Click
    const categoryTabs = document.getElementById('category-filter-tabs');
    if (categoryTabs) {
        categoryTabs.querySelectorAll('.cat-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                categoryTabs.querySelectorAll('.cat-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentCategoryFilter = btn.dataset.category;
                renderTasks();
            });
        });
    }

    // Handle Status Filter tabs click
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

        // Get pills
        const priorityVal = document.querySelector('input[name="edit-priority"]:checked').value;
        const categoryVal = document.querySelector('input[name="edit-category"]:checked').value;

        // Compile subtasks
        const subtasksList = [];
        document.querySelectorAll('#subtask-list-edit .subtask-input-item').forEach(input => {
            const completedVal = input.dataset.completed === 'true';
            subtasksList.push({
                text: input.value.trim(),
                completed: completedVal
            });
        });

        if (idVal && nameVal && taskVal && dateVal && statusVal) {
            editTask({
                id: idVal,
                name: nameVal,
                task: taskVal,
                date: dateVal,
                status: statusVal,
                priority: priorityVal,
                category: categoryVal,
                subtasks: subtasksList
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
                <span class="subtitle">Cobalah ubah filter status, kategori, atau buat tugas baru!</span>
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
