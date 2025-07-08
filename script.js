// Importa as funções do Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, where, getDocs, doc, updateDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const carsCollection = collection(db, "parkedCars");

// --- Seleção dos Elementos da UI ---
const mapElement = document.getElementById('map');
const scanBtn = document.getElementById('scan-btn');
const scannerModal = document.getElementById('scanner-modal');
const scannerView = document.getElementById('scanner-view');
const manualView = document.getElementById('manual-view');
const toggleManualBtn = document.getElementById('toggle-manual-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const manualCarIdInput = document.getElementById('manual-car-id');
const manualSaveBtn = document.getElementById('manual-save-btn');
const locationBtn = document.getElementById('location-btn');
const carListDiv = document.getElementById('car-list');
const searchInput = document.getElementById('search-input');
const filterBtn = document.getElementById('filter-btn');
const refreshBtn = document.getElementById('refresh-btn');

// --- Estado Global ---
let map, markers = {}, html5QrCode = null, allCars = [], currentFilter = 'all';

// --- LÓGICA DO MODAL (REVISADA) ---

function openScannerModal() {
    console.log("1. Abrindo o modal...");
    scannerModal.classList.remove('hidden');
    switchToScannerView(); // Define a visão do scanner como padrão
}

function closeScannerModal() {
    console.log("Fechando o modal e parando o scanner...");
    stopScanner();
    scannerModal.classList.add('hidden');
}

function switchToScannerView() {
    console.log("2. Mudando para a visão do SCANNER.");
    manualView.classList.add('hidden');
    scannerView.classList.remove('hidden');
    toggleManualBtn.textContent = 'Digitar PJI Manualmente';
    startScanner(); // Tenta iniciar a câmera
}

function switchToManualView() {
    console.log("Mudando para a visão MANUAL.");
    stopScanner(); // Para a câmera se estiver ativa
    scannerView.classList.add('hidden');
    manualView.classList.remove('hidden');
    toggleManualBtn.textContent = 'Voltar para o Scanner';
}

function startScanner() {
    console.log("3. Tentando iniciar a câmera...");
    if (html5QrCode && html5QrCode.isScanning) {
        console.log("Scanner já estava ativo.");
        return;
    }
    const formatsToSupport = [ Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.CODE_39 ];
    html5QrCode = new Html5Qrcode("reader", { formatsToSupport: formatsToSupport, verbose: false });
    html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 100 } },
        processScannedId,
        () => {}
    ).catch(err => {
        console.error("4. FALHA ao iniciar a câmera:", err);
        showNotification("Câmera não disponível. Use a digitação.", 'error');
        // Se a câmera falhar, força a mudança para a visão manual
        switchToManualView();
    });
}

function stopScanner() {
    if (html5QrCode && html5QrCode.isScanning) {
        console.log("Parando a câmera...");
        html5QrCode.stop().catch(err => console.error("Erro ao parar scanner:", err));
    }
}

// --- LÓGICA DE PROCESSAMENTO DE DADOS ---

function processScannedId(decodedText) {
    processCarId(decodedText.trim());
}

function handleManualSave() {
    const carId = manualCarIdInput.value.trim();
    processCarId(carId);
    manualCarIdInput.value = '';
}

async function processCarId(carId) {
    if (!carId) {
        showNotification('O PJI do veículo não pode ser vazio.', 'error');
        return;
    }
    if (!/^[0-9]+$/.test(carId)) {
        showNotification('ID inválido. Por favor, use apenas números.', 'error');
        return; // Interrompe a execução se for inválido
    }
    closeScannerModal();
    showNotification(`Veículo ${carId} recebido. Verificando...`, 'info');
    const q = query(carsCollection, where("carId", "==", carId));
    try {
        const querySnapshot = await getDocs(q);
        const position = await getCurrentLocation();
        if (querySnapshot.empty) {
            await addDoc(carsCollection, {
                carId, lat: position.lat, lng: position.lng, timestamp: new Date(), status: 'parked'
            });
            showNotification(`Novo veículo ${carId} adicionado!`, 'success');
        } else {
            const docRef = doc(db, "parkedCars", querySnapshot.docs[0].id);
            await updateDoc(docRef, {
                lat: position.lat, lng: position.lng, timestamp: new Date(), status: 'parked'
            });
            showNotification(`Veículo ${carId} atualizado!`, 'success');
        }
    } catch (error) {
        showNotification("Erro ao processar: " + error.message, 'error');
    }
}

// --- CONFIGURAÇÃO DE EVENTOS ---

function setupEventListeners() {
    scanBtn.addEventListener('click', openScannerModal);
    closeModalBtn.addEventListener('click', closeScannerModal);
    // Alterna entre as visões do scanner e manual
    toggleManualBtn.addEventListener('click', () => {
        if (scannerView.classList.contains('hidden')) {
            switchToScannerView();
        } else {
            switchToManualView();
        }
    });
    manualSaveBtn.addEventListener('click', handleManualSave);
    
    // Listeners que não mudaram
    locationBtn.addEventListener('click', () => {
        map.flyTo([-25.5247603, -49.112358], 15, { animate: true, duration: 1.5 });
    });
    filterBtn.addEventListener('click', handleFilterClick);
    refreshBtn.addEventListener('click', handleRefreshClick);
    searchInput.addEventListener('input', applyFiltersAndSearch);
    carListDiv.addEventListener('click', (e) => {
        const carItem = e.target.closest('.car-item');
        if (carItem) focusOnCar(carItem.dataset.id);
    });
}

// --- FUNÇÕES DE AJUDA E UI ---

function initMap() {
    map = L.map(mapElement, { zoomControl: false, tap: false }).setView([-25.4411, -49.2731], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
}

function getCurrentLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error("Geolocalização não suportada."));
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
        const marker = L.marker([car.lat, car.lng]).addTo(map).bindPopup(`<div class="font-bold">${car.carId}</div>`);
        markers[car.id] = marker;
    });
}

function updateCarList(cars) {
    if (cars.length === 0) {
        carListDiv.innerHTML = `<div class="text-center py-10"><h3 class="mt-4 text-lg font-medium text-gray-900">Nenhum veículo no pátio</h3></div>`;
        return;
    }
    carListDiv.innerHTML = cars.map(car => `
        <div class="car-item bg-white rounded-lg shadow-sm overflow-hidden p-3 hover:bg-blue-50 transition-colors cursor-pointer" data-id="${car.id}">
            <div class="flex-1">
                <div class="flex items-center justify-between">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${car.status === 'parked' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}">${car.status}</span>
                    <span class="text-xs text-gray-500">${timeAgo(car.timestamp)}</span>
                </div>
                <h3 class="mt-1 text-lg font-bold text-gray-900">${car.carId}</h3>
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

function applyFiltersAndSearch() {
    let processedCars = [...allCars];
    if (currentFilter !== 'all') {
        processedCars = processedCars.filter(car => car.status === currentFilter);
    }
    const searchTerm = searchInput.value.toLowerCase();
    if (searchTerm) {
        processedCars = processedCars.filter(car => car.carId.toLowerCase().includes(searchTerm));
    }
    updateCarList(processedCars);
}

function handleFilterClick() {
    currentFilter = (currentFilter === 'all') ? 'parked' : 'all';
    showNotification(currentFilter === 'parked' ? 'Filtrando por: Estacionados' : 'Mostrando todos os veículos', 'info');
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