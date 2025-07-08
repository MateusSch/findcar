// Importa as funções necessárias do SDK do Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    onSnapshot, 
    query, 
    orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// A variável 'firebaseConfig' é carregada do arquivo 'firebase-config.js' no HTML.
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const carsCollection = collection(db, "parkedCars");

// --- Seleção dos Elementos da UI ---
const mapElement = document.getElementById('map');
const scanBtn = document.getElementById('scan-btn');
const locationBtn = document.getElementById('location-btn');
const scannerModal = document.getElementById('scanner-modal');
const closeScannerBtn = document.getElementById('close-scanner-btn');
const carListDiv = document.getElementById('car-list');
const searchInput = document.getElementById('search-input');
const filterBtn = document.getElementById('filter-btn');
const refreshBtn = document.getElementById('refresh-btn');

// --- Estado Global da Aplicação ---
let map;
let markers = {};
let html5QrCode = null;
let allCars = []; // Cache local de todos os carros para busca e filtro
let currentFilter = 'all'; // Filtros possíveis: 'all', 'parked', 'moved'

// --- Funções de Inicialização e Lógica Principal ---

function initMap() {
    map = L.map(mapElement, {
        zoomControl: false,
        tap: false
    }).setView([-25.5259996, -49.1231727], 14);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
    }).addTo(map);
    
    L.control.zoom({ position: 'bottomright' }).addTo(map);
}

function startScanner() {
    scannerModal.style.display = 'flex';
    const formatsToSupport = [ Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.CODE_39 ];
    html5QrCode = new Html5Qrcode("reader", { formatsToSupport: formatsToSupport, verbose: false });
    html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: (w, h) => ({ width: w * 0.8, height: h * 0.4 }) },
        onScanSuccess,
        () => {}
    ).catch(err => {
        showNotification("Erro ao acessar a câmera.", 'error');
        stopScanner();
    });
}

function stopScanner() {
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().finally(() => {
            scannerModal.style.display = 'none';
        });
    } else {
        scannerModal.style.display = 'none';
    }
}

async function onScanSuccess(decodedText) {
    stopScanner();
    const carId = decodedText.trim();
    if (!carId) {
        showNotification('Código de barras inválido.', 'error');
        return;
    }
    showNotification(`Veículo ${carId} detectado. Salvando...`, 'info');
    try {
        const position = await getCurrentLocation();
        await addDoc(carsCollection, {
            carId: carId,
            lat: position.lat,
            lng: position.lng,
            timestamp: new Date(),
            status: 'parked'
        });
        showNotification(`Veículo ${carId} salvo com sucesso!`, 'success');
    } catch (error) {
        showNotification("Erro ao salvar: " + error.message, 'error');
    }
}

// --- Funções de Ajuda e UI ---

function getCurrentLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            return reject(new Error("Geolocalização não suportada."));
        }
        navigator.geolocation.getCurrentPosition(
            position => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
            () => reject(new Error("Não foi possível obter a localização.")),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    });
}

function showNotification(message, type = 'info') {
    const colors = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-blue-500' };
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 z-50 text-white px-4 py-3 rounded-lg shadow-lg ${colors[type]} notification animate-fadeIn`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.classList.add('animate-fadeOut');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function updateMarkers(cars) {
    Object.values(markers).forEach(marker => marker.remove());
    markers = {};
    cars.forEach(car => {
        const marker = L.marker([car.lat, car.lng])
            .addTo(map)
            .bindPopup(`<div class="font-bold">${car.carId}</div>`);
        markers[car.id] = marker;
    });
}

function updateCarList(cars) {
    if (cars.length === 0) {
        carListDiv.innerHTML = `<div class="text-center py-10"><h3 class="mt-4 text-lg font-medium text-gray-900">Nenhum veículo encontrado</h3></div>`;
        return;
    }
    carListDiv.innerHTML = cars.map(car => `
        <div class="car-item bg-white rounded-lg shadow-sm overflow-hidden">
            <div class="p-3 flex justify-between items-start">
                <div class="flex-1">
                    <div class="flex items-center">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${car.status === 'parked' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}">${car.status}</span>
                        <span class="ml-2 text-xs text-gray-500">${timeAgo(car.timestamp)}</span>
                    </div>
                    <h3 class="mt-1 text-lg font-bold text-gray-900">${car.carId}</h3>
                </div>
                <button class="focus-btn p-2 text-gray-500 hover:text-blue-600" data-id="${car.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>
                </button>
            </div>
        </div>
    `).join('');
}

function timeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    const intervals = { ano: 31536000, mês: 2592000, dia: 86400, hora: 3600, minuto: 60 };
    for (let unit in intervals) {
        const interval = Math.floor(seconds / intervals[unit]);
        if (interval >= 1) return `há ${interval} ${unit}${interval > 1 ? 's' : ''}`;
    }
    return 'agora mesmo';
}

function focusOnCar(carId) {
    if (markers[carId]) {
        const marker = markers[carId];
        map.flyTo(marker.getLatLng(), 18, { animate: true, duration: 1 });
        marker.openPopup();
    }
}

// --- FUNÇÕES DE FILTRO E ATUALIZAÇÃO RESTAURADAS ---

function applyFiltersAndSearch() {
    let processedCars = [...allCars];

    // 1. Aplicar filtro de status
    if (currentFilter !== 'all') {
        processedCars = processedCars.filter(car => car.status === currentFilter);
    }

    // 2. Aplicar filtro de busca por texto
    const searchTerm = searchInput.value.toLowerCase();
    if (searchTerm) {
        processedCars = processedCars.filter(car => 
            car.carId.toLowerCase().includes(searchTerm)
        );
    }

    updateCarList(processedCars);
}

function handleFilterClick() {
    // Cicla entre os filtros: all -> parked -> all
    if (currentFilter === 'all') {
        currentFilter = 'parked';
        showNotification('Filtrando por: Estacionados', 'info');
    } else {
        currentFilter = 'all';
        showNotification('Mostrando todos os veículos', 'info');
    }
    applyFiltersAndSearch();
}

function handleRefreshClick() {
    // Limpa os filtros e a busca, e mostra uma notificação
    showNotification('Lista atualizada.', 'info');
    currentFilter = 'all';
    searchInput.value = '';
    applyFiltersAndSearch(); // Re-renderiza a lista completa
    if (allCars.length > 0) {
        const bounds = L.latLngBounds(allCars.map(car => [car.lat, car.lng]));
        map.flyToBounds(bounds, { padding: [50, 50] });
    }
}

// --- Configuração de Eventos e Inicialização da Aplicação ---

function setupEventListeners() {
    scanBtn.addEventListener('click', startScanner);
    closeScannerBtn.addEventListener('click', stopScanner);
    
    locationBtn.addEventListener('click', () => {
        const fixedLat = -25.5259996;
        const fixedLng = -49.1231727;
        map.flyTo([fixedLat, fixedLng], 14, { animate: true, duration: 1.5 });
    });

    // LISTENERS RESTAURADOS
    filterBtn.addEventListener('click', handleFilterClick);
    refreshBtn.addEventListener('click', handleRefreshClick);
    searchInput.addEventListener('input', applyFiltersAndSearch);

    carListDiv.addEventListener('click', (e) => {
        const focusBtn = e.target.closest('.focus-btn');
        if (focusBtn) {
            focusOnCar(focusBtn.dataset.id);
        }
    });
}

function setupRealtimeUpdates() {
    const q = query(carsCollection, orderBy("timestamp", "desc"));
    onSnapshot(q, (snapshot) => {
        const cars = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            cars.push({
                id: doc.id,
                carId: data.carId,
                lat: data.lat,
                lng: data.lng,
                status: data.status || 'parked',
                timestamp: data.timestamp.toDate()
            });
        });
        allCars = cars; // Atualiza nosso cache local
        applyFiltersAndSearch(); // Renderiza a lista com os filtros atuais
        updateMarkers(allCars); // Atualiza todos os marcadores no mapa
    });
}

async function initApp() {
    try {
        initMap();
        setupEventListeners();
        await getCurrentLocation(); // Pega a localização inicial para o botão "onde estou"
        setupRealtimeUpdates();
    } catch (error) {
        showNotification("Erro ao iniciar o app: " + error.message, 'error');
    }
}

// Inicia a aplicação quando o DOM estiver completamente carregado.
document.addEventListener('DOMContentLoaded', initApp);