// Importa as funções necessárias do SDK do Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    onSnapshot, 
    query, 
    where,
    getDocs,
    doc,
    updateDoc,
    orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// A variável 'firebaseConfig' é carregada do arquivo 'firebase-config.js' no HTML.
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const carsCollection = collection(db, "parkedCars");

// --- Seleção dos Elementos da UI e Estado Global ---
const mapElement = document.getElementById('map');
const scanBtn = document.getElementById('scan-btn');
const locationBtn = document.getElementById('location-btn');
const scannerModal = document.getElementById('scanner-modal');
const closeScannerBtn = document.getElementById('close-scanner-btn');
const carListDiv = document.getElementById('car-list');
const searchInput = document.getElementById('search-input');
const filterBtn = document.getElementById('filter-btn');
const refreshBtn = document.getElementById('refresh-btn');

let map;
let markers = {};
let html5QrCode = null;
let allCars = [];
let currentFilter = 'all';

// --- Funções de Inicialização e Lógica Principal ---

/**
 * Renderiza a lista de carros na barra lateral.
 * @param {Array<object>} cars - A lista de carros a ser renderizada.
 */
function updateCarList(cars) {
    if (cars.length === 0) {
        carListDiv.innerHTML = `<div class="text-center py-10"><h3 class="mt-4 text-lg font-medium text-gray-900">Nenhum veículo no pátio</h3></div>`;
        return;
    }

    // ALTERAÇÃO 1: O HTML do card foi modificado.
    carListDiv.innerHTML = cars.map(car => `
        <div class="car-item bg-white rounded-lg shadow-sm overflow-hidden p-3 hover:bg-blue-50 transition-colors cursor-pointer" data-id="${car.id}">
            <div class="flex-1">
                <div class="flex items-center justify-between">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${car.status === 'parked' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}">
                        ${car.status}
                    </span>
                    <span class="text-xs text-gray-500">${timeAgo(car.timestamp)}</span>
                </div>
                <h3 class="mt-1 text-lg font-bold text-gray-900">${car.carId}</h3>
            </div>
        </div>
    `).join('');
}


/**
 * Configura todos os event listeners da página.
 */
function setupEventListeners() {
    scanBtn.addEventListener('click', startScanner);
    closeScannerBtn.addEventListener('click', stopScanner);
    
    locationBtn.addEventListener('click', () => {
        const fixedLat = -25.5247603;
        const fixedLng = -49.112358;
        map.flyTo([fixedLat, fixedLng], 15, { animate: true, duration: 1.5 });
    });

    filterBtn.addEventListener('click', handleFilterClick);
    refreshBtn.addEventListener('click', handleRefreshClick);
    searchInput.addEventListener('input', applyFiltersAndSearch);

    // ALTERAÇÃO 2: O Event Listener agora escuta cliques no card inteiro.
    carListDiv.addEventListener('click', (e) => {
        // Encontra o elemento pai mais próximo com a classe 'car-item'
        const carItem = e.target.closest('.car-item');
        if (carItem) {
            // Pega o ID do dataset do card
            const docId = carItem.dataset.id;
            focusOnCar(docId);
        }
    });
}


// --- O RESTANTE DAS FUNÇÕES PERMANECE IGUAL ---
// Nenhuma alteração é necessária nas funções abaixo.

function initMap() {
    map = L.map(mapElement, {
        zoomControl: false,
        tap: false
    }).setView([-25.4411, -49.2731], 15);
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
    showNotification(`Veículo ${carId} escaneado. Verificando no pátio...`, 'info');
    const q = query(carsCollection, where("carId", "==", carId));
    try {
        const querySnapshot = await getDocs(q);
        const position = await getCurrentLocation();
        if (querySnapshot.empty) {
            await addDoc(carsCollection, {
                carId: carId, lat: position.lat, lng: position.lng, timestamp: new Date(), status: 'parked'
            });
            showNotification(`Novo veículo ${carId} adicionado ao pátio!`, 'success');
        } else {
            const existingDoc = querySnapshot.docs[0];
            const docRef = doc(db, "parkedCars", existingDoc.id);
            await updateDoc(docRef, {
                lat: position.lat, lng: position.lng, timestamp: new Date(), status: 'parked'
            });
            showNotification(`Localização do veículo ${carId} atualizada!`, 'success');
        }
    } catch (error) {
        showNotification("Erro ao processar: " + error.message, 'error');
    }
}

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

function applyFiltersAndSearch() {
    let processedCars = [...allCars];
    if (currentFilter !== 'all') {
        processedCars = processedCars.filter(car => car.status === currentFilter);
    }
    const searchTerm = searchInput.value.toLowerCase();
    if (searchTerm) {
        processedCars = processedCars.filter(car => 
            car.carId.toLowerCase().includes(searchTerm)
        );
    }
    updateCarList(processedCars);
}

function handleFilterClick() {
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
    showNotification('Lista atualizada.', 'info');
    currentFilter = 'all';
    searchInput.value = '';
    applyFiltersAndSearch();
    if (allCars.length > 0) {
        const bounds = L.latLngBounds(allCars.map(car => [car.lat, car.lng]));
        map.flyToBounds(bounds, { padding: [50, 50] });
    }
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
        allCars = cars;
        applyFiltersAndSearch();
        updateMarkers(allCars);
    });
}

async function initApp() {
    try {
        initMap();
        setupEventListeners();
        await getCurrentLocation();
        setupRealtimeUpdates();
    } catch (error) {
        showNotification("Erro ao iniciar o app: " + error.message, 'error');
    }
}

document.addEventListener('DOMContentLoaded', initApp);