// =================================================================
// 1. IMPORTS E CONFIGURAÇÃO INICIAL
// =================================================================
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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const carsCollection = collection(db, "parkedCars");

// =================================================================
// 2. SELEÇÃO DE ELEMENTOS DA UI (DOM)
// =================================================================
const mapElement = document.getElementById('map');
const carListContainer = document.getElementById('car-list-container');
const carListDiv = document.getElementById('car-list');
const defectDetailsContainer = document.getElementById('defect-details-container');
const scanBtn = document.getElementById('scan-btn');
const locationBtn = document.getElementById('location-btn');
const scannerModal = document.getElementById('scanner-modal');
const scannerView = document.getElementById('scanner-view');
const manualView = document.getElementById('manual-view');
const toggleManualBtn = document.getElementById('toggle-manual-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const manualCarIdInput = document.getElementById('manual-car-id');
const manualSaveBtn = document.getElementById('manual-save-btn');
const searchInput = document.getElementById('search-input');
const filterBtn = document.getElementById('filter-btn');
const refreshBtn = document.getElementById('refresh-btn');
const changeStatusBtn = document.getElementById('change-status-btn');
const changeStatusModal = document.getElementById('change-status-modal');
const statusModalOverlay = document.getElementById('status-modal-overlay');
const statusSelect = document.getElementById('status-select');
const saveStatusBtn = document.getElementById('save-status-btn');
const closeStatusModalBtn = document.getElementById('close-status-modal-btn');
// NOVOS ELEMENTOS DO FILTRO LOOKER
const lookerFilterBtn = document.getElementById('looker-filter-btn');
const lookerFilterModal = document.getElementById('looker-filter-modal');
const lookerFilterOverlay = document.getElementById('looker-filter-overlay');
const defectFilterOptionsDiv = document.getElementById('defect-filter-options');
const applyLookerFilterBtn = document.getElementById('apply-looker-filter-btn');
const closeLookerFilterBtn = document.getElementById('close-looker-filter-btn');


// =================================================================
// 3. ESTADO GLOBAL E CONSTANTES
// =================================================================
let map, markers = {}, html5QrCode = null, allCars = [], currentFilter = 'all';
let currentlySelectedDocId = null; 

// Lista de defeitos para o filtro múltipla escolha
const defectFilterValues = [
    "ABERTO: ASPECTO", "ABERTO: DEF FUNCIONAMENTO", "ABERTO: DEF MECANICO",
    "ABERTO: DEFEITO GSAO", "ABERTO: DEGRADAÇÃO", "ABERTO: ENCHIMENTO",
    "ABERTO: ESTANQUEIDADE", "ABERTO: GEOMETRIA","ABERTO: RUIDO",
    "ABERTO: DEF ELETRICO", "DEFEITO ABERTO ELÉTRICO", "DEFEITO ABERTO RUÍDOS",
    "DEFEITO ABERTO S.A.O", "DEFEITO ABERTO: SAO"
];

// =================================================================
// 4. DEFINIÇÃO DE TODAS AS FUNÇÕES
// =================================================================

// --- Funções do Mapa ---
function initMap() {
    map = L.map(mapElement, { zoomControl: false, tap: false }).setView([-25.4411, -49.2731], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
}

function updateMarkers(cars) {
    Object.values(markers).forEach(marker => marker.remove());
    markers = {};
    cars.forEach(car => {
        const marker = L.marker([car.lat, car.lng]).addTo(map).bindPopup(`<div class="font-bold">${car.carId}</div>`);
        marker.on('click', () => {
            showLookerDashboard(car);
        });
        markers[car.id] = marker;
    });
}

function focusOnCar(docId) {
    if (markers[docId]) {
        const marker = markers[docId];
        map.flyTo(marker.getLatLng(), 18, { animate: true, duration: 1 });
        marker.openPopup();
    }
}

// --- Funções do Scanner e Modais ---
function openScannerModal() {
    scannerModal.classList.remove('hidden');
    switchToScannerView();
}

function closeScannerModal() {
    stopScanner();
    scannerModal.classList.add('hidden');
}

function switchToScannerView() {
    manualView.classList.add('hidden');
    scannerView.classList.remove('hidden');
    toggleManualBtn.textContent = 'Digitar Código Manualmente';
    startScanner();
}

function switchToManualView() {
    stopScanner();
    scannerView.classList.add('hidden');
    manualView.classList.remove('hidden');
    toggleManualBtn.textContent = 'Voltar para o Scanner';
}

function toggleModalView() {
    if (manualView.classList.contains('hidden')) {
        switchToManualView();
    } else {
        switchToScannerView();
    }
}

function startScanner() {
    if (html5QrCode && html5QrCode.isScanning) return;
    try {
        const formatsToSupport = [ Html5QrcodeSupportedFormats.CODE_128, Html5QrcodeSupportedFormats.EAN_13, Html5QrcodeSupportedFormats.CODE_39 ];
        html5QrCode = new Html5Qrcode("reader", { formatsToSupport, verbose: false });
        html5QrCode.start(
            { facingMode: "environment" }, 
            { fps: 10, qrbox: { width: 250, height: 100 } },
            processCarId, 
            () => {}
        ).catch(error => {
            showNotification("Câmera não disponível. Use a digitação.", 'error');
            switchToManualView();
        });
    } catch (error) {
        showNotification("Erro ao iniciar o scanner", 'error');
        switchToManualView();
    }
}

function stopScanner() {
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(err => console.error("Erro ao parar scanner:", err));
    }
}

function openChangeStatusModal(docId, currentStatus) {
    currentlySelectedDocId = docId;
    statusSelect.value = currentStatus;
    changeStatusModal.classList.remove('hidden');
}

// --- Funções do Looker (Filtro e Dashboard Individual) ---

function populateDefectFilterOptions() {
    defectFilterOptionsDiv.innerHTML = defectFilterValues.map(value => `
        <label class="flex items-center space-x-3 p-2 rounded-md hover:bg-gray-50">
            <input type="checkbox" class="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" name="defect-filter" value="${value}">
            <span class="text-gray-700">${value.replace('ABERTO: ', '')}</span>
        </label>
    `).join('');
}

function openLookerFilterModal() {
    populateDefectFilterOptions();
    lookerFilterModal.classList.remove('hidden');
}

function applyLookerFilter() {
    const selectedDefects = Array.from(document.querySelectorAll('input[name="defect-filter"]:checked'))
        .map(checkbox => checkbox.value);

    if (selectedDefects.length === 0) {
        showNotification("Selecione ao menos um tipo de defeito.", "error");
        return;
    }

    if (allCars.length === 0) {
        showNotification("Não há veículos no pátio para filtrar.", "error");
        return;
    }
    const allPJIs = allCars.map(car => `65625${car.carId}`);

    const defectsParam = encodeURIComponent(selectedDefects.join(','));
    const pjisParam = encodeURIComponent(allPJIs.join(','));

    const lookerUrl = `https://renaultssaope.cloud.looker.com/dashboards/115880?Repair+Code+Label=${defectsParam}&PJI=${pjisParam}&allow_login_screen=true`;
    window.open(lookerUrl, '_blank');
    
    lookerFilterModal.classList.add('hidden');
}

function showLookerDashboard(car) {
    focusOnCar(car.id);
    
    changeStatusBtn.classList.remove('hidden');
    changeStatusBtn.dataset.docId = car.id;
    changeStatusBtn.dataset.currentStatus = car.status;

    carListContainer.classList.add('hidden');
    defectDetailsContainer.classList.remove('hidden');
    scanBtn.classList.add('hidden');
    document.getElementById('app-container').classList.add('details-view-active');

    const pjiFilter = `65625${car.carId}`;
    const lookerUrl = `https://renaultssaope.cloud.looker.com/embed/dashboards/115875?PJI=${pjiFilter}&allow_login_screen=true`;

    defectDetailsContainer.innerHTML = `
        <div class="sticky top-0 bg-white p-3 border-b border-gray-200 z-10">
            <div class="flex items-center">
                <button id="back-to-list-btn" class="p-2 mr-2 rounded-full hover:bg-gray-200">
                    <svg class="h-6 w-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                </button>
                <div>
                    <h2 class="text-xl font-bold text-gray-800">${car.carId}</h2>
                    <p class="text-sm text-gray-600">Dashboard de Qualidade</p>
                </div>
            </div>
        </div>
        <div class="w-full flex-grow p-1 bg-gray-200">
            <iframe src="${lookerUrl}" class="w-full h-full border-0" frameborder="0" allowtransparency></iframe>
        </div>
    `;
}

// --- Lógica de Processamento de Dados ---
function handleManualSave() {
    processCarId(manualCarIdInput.value.trim());
}

async function handleChangeStatus() {
    if (!currentlySelectedDocId) return;
    const newStatus = statusSelect.value;
    const docRef = doc(db, "parkedCars", currentlySelectedDocId);
    showNotification(`Atualizando status para '${newStatus}'...`, 'info');
    try {
        await updateDoc(docRef, { status: newStatus });
        showNotification("Status atualizado com sucesso!", 'success');
    } catch (error) {
        showNotification("Erro ao atualizar status.", 'error');
    } finally {
        changeStatusModal.classList.add('hidden');
        currentlySelectedDocId = null;
    }
}

async function processCarId(carId) {
    const finalCarId = carId.substring(0, 7); // Pega apenas os 7 primeiros caracteres
    if (!finalCarId) return showNotification('O ID do veículo não pode ser vazio.', 'error');
    if (!/^[0-9]+$/.test(finalCarId)) return showNotification('ID inválido. Use apenas números.', 'error');
    closeScannerModal();
    showNotification(`Veículo ${finalCarId} recebido...`, 'info');
    try {
        const q = query(carsCollection, where("carId", "==", finalCarId));
        const querySnapshot = await getDocs(q);
        const position = await getCurrentLocation();
        if (querySnapshot.empty) {
            await addDoc(carsCollection, { carId: finalCarId, lat: position.lat, lng: position.lng, timestamp: new Date(), status: 'parked' });
            showNotification(`Novo veículo ${finalCarId} adicionado!`, 'success');
        } else {
            const docRef = doc(db, "parkedCars", querySnapshot.docs[0].id);
            await updateDoc(docRef, { lat: position.lat, lng: position.lng, timestamp: new Date(), status: 'parked' });
            showNotification(`Veículo ${finalCarId} atualizado!`, 'success');
        }
    } catch (error) {
        showNotification("Erro ao processar: " + error.message, 'error');
    }
}

// --- Funções de UI Auxiliares ---
function getCurrentLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error("Geolocalização não suportada."));
        navigator.geolocation.getCurrentPosition(
            pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => reject(new Error("Não foi possível obter a localização.")),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    });
}

function showNotification(message, type = 'info') {
    const colors = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-blue-500' };
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 z-[10001] text-white px-4 py-3 rounded-lg shadow-lg ${colors[type]} animate-fadeIn`;
    notification.textContent = message;
    document.body.querySelector('.notification')?.remove();
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.classList.add('animate-fadeOut');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function updateCarList(cars) {
    const statusStyles = {
        parked: { text: 'Estacionado', classes: 'bg-blue-100 text-blue-800' },
        pre_shipment: { text: 'Pré-Embarque', classes: 'bg-yellow-100 text-yellow-800' },
        shipped: { text: 'Embarcado', classes: 'bg-green-100 text-green-800' },
        default: { text: 'Desconhecido', classes: 'bg-gray-100 text-gray-800' }
    };
    if (cars.length === 0) {
        carListDiv.innerHTML = `<div class="text-center py-10"><h3 class="mt-4 text-lg font-medium text-gray-900">Nenhum veículo no pátio</h3></div>`;
        return;
    }
    carListDiv.innerHTML = cars.map(car => {
        const style = statusStyles[car.status] || statusStyles.default;
        return `
        <div class="car-item bg-white rounded-lg shadow-sm overflow-hidden p-3 hover:bg-blue-50 transition-colors cursor-pointer" data-id="${car.id}" data-car-id="${car.carId}" data-status="${car.status}">
            <div class="flex-1"><div class="flex items-center justify-between">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style.classes}">${style.text}</span>
                <span class="text-xs text-gray-500">${timeAgo(car.timestamp)}</span></div>
                <h3 class="mt-1 text-lg font-bold text-gray-900">${car.carId}</h3></div></div>`;
    }).join('');
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

function applyFiltersAndSearch() {
    let processedCars = [...allCars];
    if (currentFilter !== 'all') processedCars = processedCars.filter(car => car.status === currentFilter);
    const searchTerm = searchInput.value.toLowerCase();
    if (searchTerm) processedCars = processedCars.filter(car => car.carId.toLowerCase().includes(searchTerm));
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
        map.fitBounds(bounds, { padding: [50, 50] });
    }
}

// =================================================================
// 5. INICIALIZAÇÃO DA APLICAÇÃO
// =================================================================

function setupEventListeners() {
    scanBtn.addEventListener('click', openScannerModal);
    closeModalBtn.addEventListener('click', closeScannerModal);
    toggleManualBtn.addEventListener('click', toggleModalView);
    manualSaveBtn.addEventListener('click', handleManualSave);
    locationBtn.addEventListener('click', () => map.flyTo([-25.5259996, -49.1231727], 14));
    filterBtn.addEventListener('click', handleFilterClick);
    refreshBtn.addEventListener('click', handleRefreshClick);
    searchInput.addEventListener('input', applyFiltersAndSearch);

    changeStatusBtn.addEventListener('click', (e) => {
        const { docId, currentStatus } = e.currentTarget.dataset;
        if (docId && currentStatus) openChangeStatusModal(docId, currentStatus);
    });

    carListDiv.addEventListener('click', (e) => {
        const carItem = e.target.closest('.car-item');
        if (carItem) {
            const selectedCar = allCars.find(car => car.id === carItem.dataset.id);
            if(selectedCar) showLookerDashboard(selectedCar);
        }
    });

    defectDetailsContainer.addEventListener('click', (e) => {
        if (e.target.closest('#back-to-list-btn')) {
            defectDetailsContainer.classList.add('hidden');
            carListContainer.classList.remove('hidden');
            scanBtn.classList.remove('hidden');
            changeStatusBtn.classList.add('hidden');
            document.getElementById('app-container').classList.remove('details-view-active');
        }
    });
    
    // Listeners do modal de status
    saveStatusBtn.addEventListener('click', handleChangeStatus);
    closeStatusModalBtn.addEventListener('click', () => changeStatusModal.classList.add('hidden'));
    statusModalOverlay.addEventListener('click', () => changeStatusModal.classList.add('hidden'));

    // Listeners do NOVO modal de filtro do Looker
    lookerFilterBtn.addEventListener('click', openLookerFilterModal);
    closeLookerFilterBtn.addEventListener('click', () => lookerFilterModal.classList.add('hidden'));
    lookerFilterOverlay.addEventListener('click', () => lookerFilterModal.classList.add('hidden'));
    applyLookerFilterBtn.addEventListener('click', applyLookerFilter);
}

function setupRealtimeUpdates() {
    const q = query(carsCollection, orderBy("timestamp", "desc"));
    onSnapshot(q, (snapshot) => {
        allCars = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), timestamp: doc.data().timestamp.toDate() }));
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
