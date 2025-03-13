// Загрузка шаблонов из localStorage
let templates = JSON.parse(localStorage.getItem('templates')) || [];

let r
// Функция для выполнения запроса и отображения результатов
async function fetchDataAndDisplay(url, method, params) {
    const resultsContainer = document.getElementById('results');

    try {
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        // Добавляем тело запроса, если метод не GET и не DELETE
        if (method !== 'GET' && method !== 'DELETE' && params) {
            options.body = JSON.stringify(params);
        }

        // Выполняем запрос
        const response = await fetch(url, options);
        if (!response.ok) {
            const data = await response.json();
            resultsContainer.textContent = `Ошибка: ${response.status} ${response.statusText}\n\n${JSON.stringify(data, null, 2)}`;
            return
            // throw new Error(`Ошибка: ${response.status} ${response.statusText}`);
        }

        // Парсим ответ в JSON
        const data = await response.json();

        // Отображаем отформатированный JSON
        resultsContainer.textContent = JSON.stringify(data, null, 2);
    } catch (error) {
        // Обрабатываем ошибки
        r = error
        resultsContainer.textContent = `Ошибка: ${error.message}\n`;
    }
}

// Функция для обновления списка шаблонов
function updateTemplateList() {
    const templateSelect = document.getElementById('templateSelect');
    templateSelect.innerHTML = '<option value="">-- Выберите шаблон --</option>';

    templates.forEach((template, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${template.name} (${template.method} ${template.url})`;
        templateSelect.appendChild(option);
    });
}

// Функция для загрузки шаблона в форму
function loadTemplate(index) {
    const template = templates[index];
    if (template) {
        document.getElementById('url').value = template.url;
        document.getElementById('method').value = template.method;
        document.getElementById('params').value = JSON.stringify(template.params, null, 2);
        document.getElementById('comment').value = template.comment || '';
    }
}

// Обработчик отправки формы
document.getElementById('requestForm').addEventListener('submit', async (event) => {
    event.preventDefault(); // Отменяем стандартное поведение формы

    // Получаем данные из формы
    const url = document.getElementById('url').value;
    const method = document.getElementById('method').value;
    const params = JSON.parse(document.getElementById('params').value || '{}');

    // Выполняем запрос
    await fetchDataAndDisplay(url, method, params);
});

// Обработчик сохранения шаблона
document.getElementById('saveTemplate').addEventListener('click', () => {
    const url = document.getElementById('url').value;
    const method = document.getElementById('method').value;
    const params = JSON.parse(document.getElementById('params').value || '{}');
    const comment = document.getElementById('comment').value;

    const templateName = prompt('Введите имя шаблона:');
    if (templateName) {
        templates.push({ name: templateName, url, method, params, comment });
        localStorage.setItem('templates', JSON.stringify(templates)); // Сохраняем в localStorage
        updateTemplateList();
    }
});

// Обработчик удаления шаблона
document.getElementById('deleteTemplate').addEventListener('click', () => {
    const templateSelect = document.getElementById('templateSelect');
    const selectedIndex = templateSelect.value;

    if (selectedIndex) {
        templates.splice(selectedIndex, 1);
        localStorage.setItem('templates', JSON.stringify(templates)); // Обновляем localStorage
        updateTemplateList();
    }
});

// Обработчик экспорта шаблонов
document.getElementById('exportTemplates').addEventListener('click', () => {
    const dataStr = JSON.stringify(templates, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'templates.json';
    a.click();
    URL.revokeObjectURL(url);
});

// Обработчик выбора шаблона
document.getElementById('templateSelect').addEventListener('change', (event) => {
    const selectedIndex = event.target.value;
    if (selectedIndex) {
        loadTemplate(selectedIndex);
    }
});

// Инициализация списка шаблонов при загрузке страницы
updateTemplateList();