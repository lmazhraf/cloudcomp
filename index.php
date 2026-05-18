<?php
// ==========================================================================
// BACKEND CONTROL LAYER: SQLite Connection, Table Check, and API Routing
// ==========================================================================
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');

// Read the Git commit hash dynamically and safely
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

// Auto-create table tasks if it does not exist (VPS and DevOps Ready)
$pdo->exec("
    CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        task TEXT NOT NULL,
        date TEXT NOT NULL,
        status TEXT CHECK(status IN ('done', 'on progress', 'cancelled')) DEFAULT 'on progress'
    )
");

// Pre-populate with realistic, beautiful seed tasks if database is empty
$stmt = $pdo->query("SELECT COUNT(*) FROM tasks");
if ($stmt->fetchColumn() == 0) {
    $dummy_tasks = [
        ['Alice Watson', 'Implement PHP PDO SQLite connection layer', '2026-05-18', 'done'],
        ['Bob Miller', 'Design custom responsive product-grid system in style.css', '2026-05-19', 'on progress'],
        ['Alice Watson', 'Develop high-performance Canvas API custom bar chart', '2026-05-20', 'on progress'],
        ['Charlie Davies', 'Configure CI/CD workflows and dockerize for VPS deployment', '2026-05-22', 'cancelled'],
        ['Bob Miller', 'Conduct visual quality assurance on desktop & mobile screens', '2026-05-21', 'done']
    ];
    $insert_stmt = $pdo->prepare("INSERT INTO tasks (name, task, date, status) VALUES (?, ?, ?, ?)");
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
            $stmt = $pdo->prepare("INSERT INTO tasks (name, task, date, status) VALUES (?, ?, ?, ?)");
            $stmt->execute([$name, $task, $date, $status]);
            $new_id = $pdo->lastInsertId();

            echo json_encode([
                'success' => true,
                'task' => [
                    'id' => (int)$new_id,
                    'name' => $name,
                    'task' => $task,
                    'date' => $date,
                    'status' => $status
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
            $stmt = $pdo->prepare("UPDATE tasks SET name = ?, task = ?, date = ?, status = ? WHERE id = ?");
            $stmt->execute([$name, $task, $date, $status, $id]);

            echo json_encode([
                'success' => true,
                'task' => [
                    'id' => $id,
                    'name' => $name,
                    'task' => $task,
                    'date' => $date,
                    'status' => $status
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
    <title>TaskPlanner - Dashboard Produktivitas Modern</title>
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
                    <h1>TaskPlanner</h1>
                    <p class="subtitle">Dashboard To-Do List Premium</p>
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

            <!-- Online/Offline Connection Status Indicator -->
            <div id="connection-status" class="connection-status online">
                <span class="status-dot"></span>
                <span class="status-text">Online</span>
            </div>
        </header>

        <!-- MAIN LAYOUT GRID -->
        <div class="dashboard-grid">
            
            <!-- LEFT PANEL: INPUT FORM & ANALYTICS CHART -->
            <aside class="dashboard-left">
                
                <!-- TASK FORM CARD -->
                <div class="card form-card">
                    <div class="card-header">
                        <i class="fa-solid fa-circle-plus text-primary"></i>
                        <h2>Buat Tugas Baru</h2>
                    </div>
                    <form id="task-creation-form" class="task-form">
                        <div class="form-group">
                            <label for="input-name">
                                <i class="fa-solid fa-user"></i> Nama Pemilik (User)
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

                        <div class="form-row">
                            <div class="form-group flex-1">
                                <label for="input-date">
                                    <i class="fa-regular fa-calendar-days"></i> Tanggal
                                </label>
                                <input 
                                    type="date" 
                                    id="input-date" 
                                    required
                                >
                            </div>
                            
                            <div class="form-group flex-1">
                                <label for="input-status">
                                    <i class="fa-solid fa-arrow-progress"></i> Status Awal
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

                <!-- ANALYTICS CARD: CANVAS BAR CHART -->
                <div class="card chart-card">
                    <div class="card-header header-between">
                        <div class="header-left">
                            <i class="fa-solid fa-chart-simple text-accent"></i>
                            <h2>Volume Tugas Per User</h2>
                        </div>
                    </div>
                    <div class="chart-container">
                        <canvas id="userTasksChart" width="360" height="220"></canvas>
                    </div>
                </div>

            </aside>

            <!-- RIGHT PANEL: TASK CONTROLS & CARDS CONTAINER -->
            <main class="dashboard-right">
                
                <!-- FILTER & SEARCH BAR -->
                <div class="controls-bar">
                    <div class="search-wrapper">
                        <i class="fa-solid fa-magnifying-glass search-icon"></i>
                        <input 
                            type="text" 
                            id="search-input" 
                            placeholder="Cari nama user atau deskripsi tugas..." 
                            autocomplete="off"
                        >
                    </div>
                    
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

                <!-- TASKS GRID LIST -->
                <div class="tasks-grid" id="tasks-cards-grid">
                    <!-- Dynamic tasks cards injected by script.js -->
                    <div id="loading-state" class="state-placeholder">
                        <i class="fa-solid fa-spinner-third fa-spin text-primary loader-icon"></i>
                        <p>Mengambil data dari server...</p>
                    </div>
                </div>

            </main>

        </div>

        <!-- FOOTER -->
        <footer class="dashboard-footer">
            <p>TaskPlanner &copy; 2026 &bull; VPS-Ready Serverless SQLite PHP Stack &bull; <span class="commit-badge"><i class="fa-solid fa-code-branch"></i> <?= htmlspecialchars($commit_hash) ?></span></p>
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
                        <i class="fa-solid fa-user"></i> Nama Pemilik (User)
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

                <div class="form-row">
                    <div class="form-group flex-1">
                        <label for="edit-date">
                            <i class="fa-regular fa-calendar-days"></i> Tanggal
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

    <!-- MAIN JAVASCRIPT LAYER -->
    <script src="script.js"></script>
</body>
</html>
