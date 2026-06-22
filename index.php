<?php
// ========== PERBAIKAN KEAMANAN HEADER ==========

// 1. Batasi CORS hanya ke domain sendiri (hapus blok ini jika tidak butuh CORS sama sekali)
$allowed_origin = 'https://planmytask.my.id';   // sudah diperbaiki typo
if (isset($_SERVER['HTTP_ORIGIN']) && $_SERVER['HTTP_ORIGIN'] === $allowed_origin) {
    header('Access-Control-Allow-Origin: ' . $allowed_origin);
    header('Access-Control-Allow-Headers: Content-Type');
}
// Jika tidak butuh CORS, hapus 4 baris di atas.

// 2. Content Security Policy (CSP) – lengkap dengan izin CDN
header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none';");

// 3. Anti-clickjacking
header('X-Frame-Options: DENY');

// 4. HTTP Strict Transport Security (HSTS)
header('Strict-Transport-Security: max-age=31536000; includeSubDomains; preload');

// 5. Mencegah MIME sniffing
header('X-Content-Type-Options: nosniff');

// 6. Cache-Control untuk halaman dinamis
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

// Membaca hash commit Git secara dinamis dan aman
$commit_hash = 'N/A';
$git_dir = __DIR__ . '/.git';
if (is_dir($git_dir)) {
    $head_file = $git_dir . '/HEAD';
    if (file_exists($head_file)) {
        $head_content = trim(file_get_contents($head_file));
        if (strpos($head_content, 'ref:') === 0) {
            $ref_path = trim(substr($head_content, 4));
            $ref_file = $git_dir . '/' . $ref_path;
            if (file_exists($ref_file)) {
                $commit_hash = substr(trim(file_get_contents($ref_file)), 0, 7);
            }
        } else {
            $commit_hash = substr($head_content, 0, 7);
        }
    }
}


$db_path = __DIR__ . '/database.sqlite';
try {
    $pdo = new PDO("sqlite:$db_path");
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    header('Content-Type: application/json', true, 500);
    echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
    exit;
}

// Buat tabel tugas secara otomatis jika belum ada (Siap untuk VPS dan DevOps)
$pdo->exec("
    CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        task TEXT NOT NULL,
        date TEXT NOT NULL,
        status TEXT CHECK(status IN ('done', 'on progress', 'cancelled')) DEFAULT 'on progress'
    )
");

// Migrasi database secara dinamis untuk kolom baru jika sudah ada tabel sebelumnya
$columns_stmt = $pdo->query("PRAGMA table_info(tasks)");
$columns = $columns_stmt->fetchAll(PDO::FETCH_COLUMN, 1);

if (!in_array('priority', $columns)) {
    $pdo->exec("ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT 'Sedang'");
}
if (!in_array('category', $columns)) {
    $pdo->exec("ALTER TABLE tasks ADD COLUMN category TEXT DEFAULT 'Lainnya'");
}
if (!in_array('subtasks', $columns)) {
    $pdo->exec("ALTER TABLE tasks ADD COLUMN subtasks TEXT DEFAULT '[]'");
}

// Isi terlebih dahulu dengan tugas-tugas awal yang realistis dan indah jika basis data kosong
$stmt = $pdo->query("SELECT COUNT(*) FROM tasks");
if ($stmt->fetchColumn() == 0) {
    $dummy_tasks = [
        ['Azhraf', 'Penerapan GIT Flow dan Kolaborasi', '2026-05-26', 'done', 'Tinggi', 'Kuliah', '[]'],
        ['Meyla', 'Kualitas Aplikasi dan dokumentasi', '2026-05-26', 'on progress', 'Sedang', 'Kuliah', '[]'],
        ['Rifky', 'Keberhasilan akses via Domain & HTTPS', '2026-05-19', 'done', 'Tinggi', 'Kuliah', '[]'],
        ['Devi', 'Otomatisasi CI/CD', '2026-05-19', 'done', 'Sedang', 'Lainnya', '[]']
    ];
    $insert_stmt = $pdo->prepare("INSERT INTO tasks (name, task, date, status, priority, category, subtasks) VALUES (?, ?, ?, ?, ?, ?, ?)");
    foreach ($dummy_tasks as $task) {
        $insert_stmt->execute($task);
    }
}

// API Router
$action = $_GET['action'] ?? null;
if ($action) {
    header('Content-Type: application/json');
    $input = json_decode(file_get_contents('php://input'), true);

    if ($action === 'get_tasks') {
        try {
            $stmt = $pdo->query("SELECT * FROM tasks ORDER BY id DESC");
            $tasks = $stmt->fetchAll();
            // Decode subtasks column for response
            foreach ($tasks as &$task) {
                $task['id'] = (int)$task['id'];
                $task['subtasks'] = json_decode($task['subtasks'] ?? '[]', true);
            }
            echo json_encode($tasks);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
        exit;
    }

    if ($action === 'add_task' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $name = trim($input['name'] ?? '');
        $task = trim($input['task'] ?? '');
        $date = trim($input['date'] ?? '');
        $status = trim($input['status'] ?? 'on progress');
        $priority = trim($input['priority'] ?? 'Sedang');
        $category = trim($input['category'] ?? 'Lainnya');
        $subtasks = json_encode($input['subtasks'] ?? []);

        if (empty($name) || empty($task) || empty($date)) {
            http_response_code(400);
            echo json_encode(['error' => 'Semua kolom input wajib diisi!']);
            exit;
        }

        if (!in_array($status, ['done', 'on progress', 'cancelled'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Status tidak valid!']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("INSERT INTO tasks (name, task, date, status, priority, category, subtasks) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$name, $task, $date, $status, $priority, $category, $subtasks]);
            $new_id = $pdo->lastInsertId();

            echo json_encode([
                'success' => true,
                'task' => [
                    'id' => (int)$new_id,
                    'name' => $name,
                    'task' => $task,
                    'date' => $date,
                    'status' => $status,
                    'priority' => $priority,
                    'category' => $category,
                    'subtasks' => json_decode($subtasks, true)
                ]
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
        exit;
    }

    if ($action === 'update_status' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $id = intval($input['id'] ?? 0);
        $status = trim($input['status'] ?? '');

        if (!$id || empty($status)) {
            http_response_code(400);
            echo json_encode(['error' => 'ID dan status wajib ditentukan!']);
            exit;
        }

        if (!in_array($status, ['done', 'on progress', 'cancelled'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Status tidak valid!']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("UPDATE tasks SET status = ? WHERE id = ?");
            $stmt->execute([$status, $id]);

            if ($stmt->rowCount() === 0) {
                http_response_code(404);
                echo json_encode(['error' => 'Tugas tidak ditemukan!']);
                exit;
            }

            echo json_encode(['success' => true, 'id' => $id, 'status' => $status]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
        exit;
    }

    if ($action === 'update_subtasks' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $id = intval($input['id'] ?? 0);
        $subtasks = json_encode($input['subtasks'] ?? []);

        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'ID wajib ditentukan!']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("UPDATE tasks SET subtasks = ? WHERE id = ?");
            $stmt->execute([$subtasks, $id]);

            echo json_encode(['success' => true, 'id' => $id, 'subtasks' => json_decode($subtasks, true)]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
        exit;
    }

    if ($action === 'delete_task' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $id = intval($input['id'] ?? 0);

        if (!$id) {
            http_response_code(400);
            echo json_encode(['error' => 'ID wajib ditentukan!']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("DELETE FROM tasks WHERE id = ?");
            $stmt->execute([$id]);

            if ($stmt->rowCount() === 0) {
                http_response_code(404);
                echo json_encode(['error' => 'Tugas tidak ditemukan!']);
                exit;
            }

            echo json_encode(['success' => true, 'id' => $id]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
        exit;
    }

    if ($action === 'edit_task' && $_SERVER['REQUEST_METHOD'] === 'POST') {
        $id = intval($input['id'] ?? 0);
        $name = trim($input['name'] ?? '');
        $task = trim($input['task'] ?? '');
        $date = trim($input['date'] ?? '');
        $status = trim($input['status'] ?? 'on progress');
        $priority = trim($input['priority'] ?? 'Sedang');
        $category = trim($input['category'] ?? 'Lainnya');
        $subtasks = json_encode($input['subtasks'] ?? []);

        if (!$id || empty($name) || empty($task) || empty($date)) {
            http_response_code(400);
            echo json_encode(['error' => 'Semua kolom input wajib diisi!']);
            exit;
        }

        if (!in_array($status, ['done', 'on progress', 'cancelled'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Status tidak valid!']);
            exit;
        }

        try {
            $stmt = $pdo->prepare("UPDATE tasks SET name = ?, task = ?, date = ?, status = ?, priority = ?, category = ?, subtasks = ? WHERE id = ?");
            $stmt->execute([$name, $task, $date, $status, $priority, $category, $subtasks, $id]);

            echo json_encode([
                'success' => true,
                'task' => [
                    'id' => $id,
                    'name' => $name,
                    'task' => $task,
                    'date' => $date,
                    'status' => $status,
                    'priority' => $priority,
                    'category' => $category,
                    'subtasks' => json_decode($subtasks, true)
                ]
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => $e->getMessage()]);
        }
        exit;
    }

    http_response_code(404);
    echo json_encode(['error' => 'API Endpoint tidak ditemukan']);
    exit;
}
?>
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TaskPlanner - Dashboard Produktivitas SI Premium</title>
    <!-- Google Fonts: Outfit -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <!-- FontAwesome Icon Set -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="dashboard-wrapper">
        <!-- HEADER GLASSMORPHISM -->
        <header class="dashboard-header">
            <div class="header-logo">
                <div class="logo-box">
                    <i class="fa-solid fa-list-check"></i>
                </div>
                <div>
                    <h1>To-Do List</h1>
                    <p class="subtitle">Kelompok 3 - Cloud Computing</p>
                </div>
            </div>
            
            <!-- Overall Stats Bar -->
            <div class="header-stats">
                <div class="progress-info-container">
                    <div class="stats-text-row">
                        <span class="stats-label">Progress Penyelesaian</span>
                        <span id="progress-percentage-text" class="stats-value">0%</span>
                    </div>
                    <div class="progress-bar-track">
                        <div id="progress-bar-fill" class="progress-bar-fill" style="width: 0%;"></div>
                    </div>
                    <div class="stats-counter-sub">
                        <span id="completed-counter-text">0 selesai</span>
                        <span class="dot">&bull;</span>
                        <span id="total-counter-text">0 total tugas</span>
                    </div>
                </div>
            </div>
            
            <!-- Header Actions: Theme & Connection -->
            <div class="header-actions">
                <button id="theme-toggle-btn" class="theme-toggle-btn" title="Ganti Tema">
                    <i class="fa-solid fa-moon"></i>
                </button>
                <div id="connection-status" class="connection-status online">
                    <span class="status-dot"></span>
                    <span class="status-text">Online</span>
                </div>
            </div>
        </header>

        <!-- MAIN LAYOUT GRID -->
        <div class="dashboard-grid">
            
            <!-- PANEL KIRI: FORMULIR MASUKAN & BAGAN ANALITIK -->
            <aside class="dashboard-left">
                
                
                <div class="card form-card" id="form-card-panel">
                    <div class="card-header header-between">
                        <div class="header-left">
                            <i class="fa-solid fa-circle-plus text-primary"></i>
                            <h2>Buat Tugas Baru</h2>
                        </div>
                        <button type="button" class="btn-close-form" id="btn-close-form" title="Tutup Formulir">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                    <form id="task-creation-form" class="task-form">
                        <div class="form-group">
                            <label for="input-name">
                                <i class="fa-solid fa-user"></i> Nama (User)
                            </label>
                            <input 
                                type="text" 
                                id="input-name" 
                                placeholder="Masukkan nama Anda..." 
                                required 
                                autocomplete="off"
                                maxlength="50"
                            >
                        </div>
                        
                        <div class="form-group">
                            <label for="input-task">
                                <i class="fa-solid fa-pen-nib"></i> Deskripsi Tugas
                            </label>
                            <textarea 
                                id="input-task" 
                                rows="3" 
                                placeholder="Tulis rincian tugas yang ingin dicapai..." 
                                required 
                                maxlength="200"
                            ></textarea>
                        </div>

                        
                        <div class="form-group">
                            <label><i class="fa-solid fa-triangle-exclamation"></i> Prioritas Tugas</label>
                            <div class="priority-selector" id="priority-selector-create">
                                <label class="priority-pill low">
                                    <input type="radio" name="create-priority" value="Rendah">
                                    <span>Rendah</span>
                                </label>
                                <label class="priority-pill medium active">
                                    <input type="radio" name="create-priority" value="Sedang" checked>
                                    <span>Sedang</span>
                                </label>
                                <label class="priority-pill high">
                                    <input type="radio" name="create-priority" value="Tinggi">
                                    <span>Tinggi</span>
                                </label>
                            </div>
                        </div>

                        
                        <div class="form-group">
                            <label><i class="fa-solid fa-tags"></i> Kategori</label>
                            <div class="category-selector" id="category-selector-create">
                                <label class="category-pill active">
                                    <input type="radio" name="create-category" value="Lainnya" checked>
                                    <span><i class="fa-solid fa-tag"></i> Umum</span>
                                </label>
                                <label class="category-pill">
                                    <input type="radio" name="create-category" value="Kuliah">
                                    <span><i class="fa-solid fa-graduation-cap"></i> Kuliah</span>
                                </label>
                                <label class="category-pill">
                                    <input type="radio" name="create-category" value="Kerja">
                                    <span><i class="fa-solid fa-briefcase"></i> Kerja</span>
                                </label>
                                <label class="category-pill">
                                    <input type="radio" name="create-category" value="Pribadi">
                                    <span><i class="fa-solid fa-user"></i> Pribadi</span>
                                </label>
                            </div>
                        </div>

                        
                        <div class="form-group">
                            <label><i class="fa-solid fa-list-check"></i> Sub-tugas (Checklist)</label>
                            <div class="subtask-builder-container">
                                <div class="subtask-inputs-list" id="subtask-list-create">
                                    
                                </div>
                                <button type="button" class="btn-add-subtask-row" id="btn-add-subtask-create">
                                    <i class="fa-solid fa-plus-circle"></i> Tambah Sub-tugas
                                </button>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group flex-1">
                                <label for="input-date">
                                    <i class="fa-regular fa-calendar-days"></i> Deadline
                                </label>
                                <input 
                                    type="date" 
                                    id="input-date" 
                                    required
                                >
                            </div>
                            
                            <div class="form-group flex-1">
                                <label for="input-status">
                                    <i class="fa-solid fa-arrow-progress"></i> Status
                                </label>
                                <select id="input-status" required>
                                    <option value="on progress" selected>On Progress</option>
                                    <option value="done">Done</option>
                                    <option value="cancelled">Cancelled</option>
                                </select>
                            </div>
                        </div>

                        <button type="submit" class="btn btn-primary btn-block">
                            <i class="fa-solid fa-plus-large"></i> Tambahkan ke List
                        </button>
                    </form>
                </div>

                
                <div class="card chart-card">
                    <div class="card-header header-between">
                        <div class="header-left">
                            <i class="fa-solid fa-chart-simple text-accent"></i>
                            <h2>Visualisasi - Bar Chart</h2>
                        </div>
                    </div>
                    <div class="chart-container">
                        <canvas id="userTasksChart" width="360" height="220"></canvas>
                    </div>
                </div>

            </aside>

            
            <main class="dashboard-right">
                
               
                <div class="controls-bar">
                    <div class="search-sort-row">
                        <div class="search-wrapper">
                            <i class="fa-solid fa-magnifying-glass search-icon"></i>
                            <input 
                                type="text" 
                                id="search-input" 
                                placeholder="Cari nama user atau deskripsi tugas..." 
                                autocomplete="off"
                            >
                        </div>
                        <div class="sort-wrapper">
                            <label for="sort-select"><i class="fa-solid fa-arrow-down-wide-short"></i> Urutkan:</label>
                            <select id="sort-select" class="sort-select">
                                <option value="newest" selected>Terbaru</option>
                                <option value="oldest">Terlama</option>
                                <option value="due_soon">Tenggat Terdekat</option>
                                <option value="priority_desc">Prioritas: Tinggi ke Rendah</option>
                            </select>
                        </div>
                    </div>

                    <!-- Kategori Tab Filters -->
                    <div class="category-tabs-container">
                        <span class="filter-title"><i class="fa-solid fa-tags"></i> Kategori:</span>
                        <div class="category-tabs" id="category-filter-tabs">
                            <button class="cat-tab-btn active" data-category="all">Semua</button>
                            <button class="cat-tab-btn" data-category="Kuliah"><i class="fa-solid fa-graduation-cap"></i> Kuliah</button>
                            <button class="cat-tab-btn" data-category="Kerja"><i class="fa-solid fa-briefcase"></i> Kerja</button>
                            <button class="cat-tab-btn" data-category="Pribadi"><i class="fa-solid fa-user"></i> Pribadi</button>
                            <button class="cat-tab-btn" data-category="Lainnya"><i class="fa-solid fa-tag"></i> Umum</button>
                        </div>
                    </div>

                    <!-- Prioritas Tab Filters -->
                    <div class="priority-tabs-container">
                        <span class="filter-title"><i class="fa-solid fa-triangle-exclamation"></i> Prioritas:</span>
                        <div class="priority-tabs" id="priority-filter-tabs">
                            <button class="pri-tab-btn active" data-priority="all">Semua</button>
                            <button class="pri-tab-btn" data-priority="Tinggi"><span class="pri-dot high"></span> Tinggi</button>
                            <button class="pri-tab-btn" data-priority="Sedang"><span class="pri-dot medium"></span> Sedang</button>
                            <button class="pri-tab-btn" data-priority="Rendah"><span class="pri-dot low"></span> Rendah</button>
                        </div>
                    </div>
                    
                    <!-- Status Tab Filters -->
                    <div class="status-tabs-container">
                        <span class="filter-title"><i class="fa-solid fa-circle-question"></i> Status:</span>
                        <div class="filter-tabs">
                            <button class="tab-btn active" data-filter="all">
                                <span class="tab-label">Semua</span>
                                <span class="tab-badge bg-primary" id="badge-all">0</span>
                            </button>
                            <button class="tab-btn" data-filter="on progress">
                                <span class="tab-label">On Progress</span>
                                <span class="tab-badge bg-warning" id="badge-progress">0</span>
                            </button>
                            <button class="tab-btn" data-filter="done">
                                <span class="tab-label">Done</span>
                                <span class="tab-badge bg-success" id="badge-done">0</span>
                            </button>
                            <button class="tab-btn" data-filter="cancelled">
                                <span class="tab-label">Cancelled</span>
                                <span class="tab-badge bg-danger" id="badge-cancelled">0</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- DAFTAR KOTAK TUGAS -->
                <div class="tasks-grid" id="tasks-cards-grid">
                    <!-- Kartu tugas dinamis disuntikkan oleh script.js -->
                    <div id="loading-state" class="state-placeholder">
                        <i class="fa-solid fa-circle-notch fa-spin text-primary loader-icon"></i>
                        <p>Mengambil data dari server...</p>
                    </div>
                </div>

            </main>

        </div>

        <!-- FOOTER -->
        <footer class="dashboard-footer">
            <p>Copyright &copy; 2026 &bull; To-Do List Kelompok 3 &bull; <span class="commit-badge"><i class="fa-solid fa-code-branch"></i> <?= htmlspecialchars($commit_hash) ?></span></p>
        </footer>
    </div>

    <!-- EDIT TASK MODAL -->
    <div id="edit-task-modal" class="modal-overlay">
        <div class="modal-content glass-card">
            <div class="modal-header">
                <h2><i class="fa-solid fa-pen-to-square text-primary"></i> Edit Tugas</h2>
                <button type="button" class="btn-close-modal" id="btn-close-modal">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
            <form id="task-edit-form" class="task-form">
                <input type="hidden" id="edit-task-id">
                
                <div class="form-group">
                    <label for="edit-name">
                        <i class="fa-solid fa-user"></i> Nama User
                    </label>
                    <input 
                        type="text" 
                        id="edit-name" 
                        placeholder="Masukkan nama Anda..." 
                        required 
                        autocomplete="off"
                        maxlength="50"
                    >
                </div>
                
                <div class="form-group">
                    <label for="edit-task">
                        <i class="fa-solid fa-pen-nib"></i> Deskripsi Tugas
                    </label>
                    <textarea 
                        id="edit-task" 
                        rows="3" 
                        placeholder="Tulis rincian tugas..." 
                        required 
                        maxlength="200"
                    ></textarea>
                </div>

                <!-- PILIHAN PRIORITAS (PILLS) UNTUK EDIT -->
                <div class="form-group">
                    <label><i class="fa-solid fa-triangle-exclamation"></i> Prioritas Tugas</label>
                    <div class="priority-selector" id="priority-selector-edit">
                        <label class="priority-pill low">
                            <input type="radio" name="edit-priority" value="Rendah">
                            <span>Rendah</span>
                        </label>
                        <label class="priority-pill medium">
                            <input type="radio" name="edit-priority" value="Sedang">
                            <span>Sedang</span>
                        </label>
                        <label class="priority-pill high">
                            <input type="radio" name="edit-priority" value="Tinggi">
                            <span>Tinggi</span>
                        </label>
                    </div>
                </div>

                <!-- PILIHAN KATEGORI (PILLS) UNTUK EDIT -->
                <div class="form-group">
                    <label><i class="fa-solid fa-tags"></i> Kategori</label>
                    <div class="category-selector" id="category-selector-edit">
                        <label class="category-pill">
                            <input type="radio" name="edit-category" value="Lainnya">
                            <span><i class="fa-solid fa-tag"></i> Umum</span>
                        </label>
                        <label class="category-pill">
                            <input type="radio" name="edit-category" value="Kuliah">
                            <span><i class="fa-solid fa-graduation-cap"></i> Kuliah</span>
                        </label>
                        <label class="category-pill">
                            <input type="radio" name="edit-category" value="Kerja">
                            <span><i class="fa-solid fa-briefcase"></i> Kerja</span>
                        </label>
                        <label class="category-pill">
                            <input type="radio" name="edit-category" value="Pribadi">
                            <span><i class="fa-solid fa-user"></i> Pribadi</span>
                        </label>
                    </div>
                </div>

                <!-- SUB-TUGAS BUILDER UNTUK EDIT -->
                <div class="form-group">
                    <label><i class="fa-solid fa-list-check"></i> Sub-tugas (Checklist)</label>
                    <div class="subtask-builder-container">
                        <div class="subtask-inputs-list" id="subtask-list-edit">
                            <!-- Input baris sub-tugas dinamis untuk edit -->
                        </div>
                        <button type="button" class="btn-add-subtask-row" id="btn-add-subtask-edit">
                            <i class="fa-solid fa-plus-circle"></i> Tambah Sub-tugas
                        </button>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group flex-1">
                        <label for="edit-date">
                            <i class="fa-regular fa-calendar-days"></i> Tanggal Batas
                        </label>
                        <input 
                            type="date" 
                            id="edit-date" 
                            required
                        >
                    </div>
                    
                    <div class="form-group flex-1">
                        <label for="edit-status">
                            <i class="fa-solid fa-arrow-progress"></i> Status
                        </label>
                        <select id="edit-status" required>
                            <option value="on progress">On Progress</option>
                            <option value="done">Done</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                    </div>
                </div>

                <div class="modal-footer-actions">
                    <button type="button" class="btn btn-secondary" id="btn-cancel-edit">Batal</button>
                    <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
                </div>
            </form>
        </div>
    </div>

    <!-- MOBILE FLOATING ACTION BUTTON (FAB) -->
    <button id="mobile-fab" class="mobile-fab" title="Tambah Tugas Baru">
        <i class="fa-solid fa-plus"></i>
    </button>

    <!-- MOBILE DRAWER BACKDROP OVERLAY -->
    <div id="drawer-overlay" class="drawer-overlay"></div>

    <!-- LIGHTWEIGHT CONFETTI CANVAS -->
    <canvas id="confetti-canvas" style="position:fixed; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:9999; display:none;"></canvas>

    <!-- MAIN JAVASCRIPT LAYER -->
    <script src="script.js"></script>
</body>
</html>
