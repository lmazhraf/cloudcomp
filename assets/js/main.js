import { getTasks, saveTasks } from './storage.js';
import { renderTasks } from './ui/render.js';

let tasks = getTasks();

window.addTask = function () {
    const nameInput = document.getElementById("nameInput");
    const taskInput = document.getElementById("taskInput");
    const dateInput = document.getElementById("dateInput");

    const name = nameInput.value.trim();
    const text = taskInput.value.trim();
    const date = dateInput.value;

    // 🔴 VALIDASI KOSONG
    if (!name || !text || !date) {
        alert("Semua field wajib diisi!");
        return;
    }

    // 🔴 VALIDASI DUPLIKAT (nama + task + tanggal sama)
    const isDuplicate = tasks.some(task =>
        task.name === name &&
        task.text === text &&
        task.date === date
    );

    if (isDuplicate) {
        alert("Task sudah ada (duplikat)!");
        return;
    }

    // ✅ BUAT DATA
    const newTask = {
        id: Date.now(),
        name: name,
        text: text,
        date: date,
        done: false
    };

    tasks.push(newTask);

    saveTasks(tasks);
    renderTasks(tasks);

    // RESET INPUT
    nameInput.value = "";
    taskInput.value = "";
    dateInput.value = "";
};

window.onload = function () {
    renderTasks(tasks);
};