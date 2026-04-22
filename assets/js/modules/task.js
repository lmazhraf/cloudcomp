export function toggleTask(tasks, id) {
    return tasks.map(task =>
        task.id === id ? { ...task, done: !task.done } : task
    );
}

export function deleteTask(tasks, id) {
    return tasks.filter(task => task.id !== id);
}