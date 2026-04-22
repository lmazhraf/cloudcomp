import { getTasks, saveTasks } from './storage.js';
import { renderTasks } from './ui/render.js';

let tasks = getTasks();

window.addTask = function () {
    const input = document.getElementById("taskInput");

    const task = {
        id: Date.now(),
        text: input.value,
        done: false
    };

    tasks.push(task);
    saveTasks(tasks);
    renderTasks(tasks);

    input.value = "";
};

window.onload = function () {
    renderTasks(tasks);
};