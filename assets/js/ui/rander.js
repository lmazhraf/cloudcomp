export function renderTasks(tasks) {
    const list = document.getElementById("taskList");
    list.innerHTML = "";

    tasks.forEach(task => {
        const li = document.createElement("li");

        li.innerHTML = `
            <strong>${task.name}</strong> - 
            ${task.text} 
            (${task.date})
        `;

        list.appendChild(li);
    });
}