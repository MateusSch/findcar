// =================================================================
// 1. IMPORTS E CONFIGURAÇÃO INICIAL
// =================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, query, where, getDocs, doc, updateDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
const defectInfoModal = document.getElementById('defect-info-modal');
const defectModalOverlay = document.getElementById('defect-modal-overlay');
const defectModalTitle = document.getElementById('defect-modal-title');
const defectModalContent = document.getElementById('defect-modal-content');
const closeDefectModalBtn = document.getElementById('close-defect-modal-btn');
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

// =================================================================
// 3. ESTADO GLOBAL DA APLICAÇÃO
// =================================================================
let map, markers = {}, html5QrCode = null, allCars = [], currentFilter = 'all';

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
            focusOnCar(car.id);
            fetchAndShowDefects(car.carId);
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

// --- Funções do Scanner e Modal de Scan ---
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

/**
 * Cria o HTML para o cabeçalho do painel de detalhes do veículo.
 * @param {string} carId - O ID do carro.
 * @param {number|null} defectCount - O número de defeitos encontrados, ou null se a busca falhou.
 * @returns {string} O HTML do cabeçalho.
 */
function createDefectPanelHeader(carId, defectCount) {
    let defectText = '';
    let textColor = 'text-gray-500';

    if (defectCount !== null) {
        defectText = `${defectCount} defeito(s) em aberto`;
        textColor = defectCount > 0 ? 'text-red-600' : 'text-green-600';
    } else {
        defectText = 'Consulta de defeitos indisponível';
    }

    return `
        <div class="sticky top-0 bg-white p-3 border-b border-gray-200 z-10">
            <div class="flex items-center">
                <button id="back-to-list-btn" class="p-2 mr-2 rounded-full hover:bg-gray-200">
                    <svg class="h-6 w-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                </button>
                <div>
                    <h2 class="text-xl font-bold text-gray-800">${carId}</h2>
                    <p class="text-sm font-semibold ${textColor}">${defectText}</p>
                    <a href="http://psfweb-uas.renault.br/PSFV/NEO/#/consultations/vehicules/pji/${carId}/defauts-gret" 
                       target="_blank" rel="noopener noreferrer"
                       class="mt-2 inline-block bg-blue-600 text-white px-3 py-1 rounded-md text-sm font-semibold hover:bg-blue-700 transition-colors">
                        Ver Defeitos GRET
                    </a>
                </div>
            </div>
        </div>
    `;
}

// --- Funções de Defeitos e Detalhes ---
async function fetchAndShowDefects(carId) {
    const carToFocus = allCars.find(c => c.carId === carId);
    if (carToFocus) {
        focusOnCar(carToFocus.id);
    }
    
    // Mostra o painel e uma mensagem de carregamento inicial
    carListContainer.classList.add('hidden');
    defectDetailsContainer.classList.remove('hidden');
    defectDetailsContainer.innerHTML = `<div class="text-center py-10"><div class="w-8 h-8 border-t-4 border-blue-500 border-solid rounded-full animate-spin mx-auto"></div><p class="mt-3">Buscando defeitos para ${carId}...</p></div>`;
    scanBtn.classList.add('hidden');

    try {
        const apiUrl = `http://psfweb-uas.renault.br/PSFV/NEO/consultations/vehicules/pji/${carId}/qualite`;
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`Falha na API: ${response.statusText}`);
        
        const data = await response.json();
        const openDefects = (data.generalites?.plistGret || []).filter(d => d.dateReprise === null);
        
        // Em caso de sucesso, chama a renderDefectList
        renderDefectList(carId, openDefects);

    } catch (error) {
        console.error("Erro ao buscar defeitos:", error);
        
        // Em caso de falha, gera o cabeçalho e adiciona a mensagem de erro
        const headerHTML = createDefectPanelHeader(carId, null); // Passa null para o contador de defeitos
        const errorHTML = `<div class="p-4 text-center text-red-700 bg-red-50 rounded-b-lg">Não foi possível carregar a lista de defeitos.</div>`;
        defectDetailsContainer.innerHTML = headerHTML + errorHTML;
    }
}

function renderDefectList(carId, defects) {
    // Gera o cabeçalho passando a contagem de defeitos
    const headerHTML = createDefectPanelHeader(carId, defects.length);

    const defectListHTML = defects.map(defect => `
        <div class="defect-item bg-white p-3 rounded-lg shadow-sm hover:bg-yellow-50 cursor-pointer" data-details='${JSON.stringify(defect)}'>
            <p class="font-bold text-red-700">Elemento: ${defect.codeElement}, Incidente: ${defect.codeIncident}</p>
            <p class="mt-1 text-sm text-gray-600">Local: ${defect.localisation.trim()}</p>
            <p class="text-sm text-gray-500">Constatado em: ${new Date(defect.dateConstat).toLocaleDateString('pt-BR')}</p>
        </div>`).join('');

    // Junta o cabeçalho com a lista de defeitos
    defectDetailsContainer.innerHTML = headerHTML + `
        <div class="p-2 space-y-2">
            ${defects.length > 0 ? defectListHTML : '<p class="text-center p-4 text-gray-600">Nenhum defeito em aberto para este veículo.</p>'}
        </div>
    `;
}

function showDefectDetailsModal(defectData) {
    const details = defectData.pgretDetails;
    defectModalTitle.textContent = `Defeito: ${defectData.codeElement} / ${defectData.codeIncident}`;
    defectModalContent.innerHTML = `
        <p><strong class="w-32 inline-block">Elemento:</strong> ${details.libelleElement.trim()}</p>
        <p><strong class="w-32 inline-block">Incidente:</strong> ${details.libelleIncident.trim()}</p>
        <p><strong class="w-32 inline-block">Localização:</strong> ${defectData.localisation.trim()}</p>
        <p><strong class="w-32 inline-block">Data Constat.:</strong> ${new Date(defectData.dateConstat).toLocaleString('pt-BR')}</p>
        <p><strong class="w-32 inline-block">Retoque:</strong> ${details.libelleRetouche.trim()}</p>
        <p><strong class="w-32 inline-block">Comentário:</strong> ${details.commentaire.trim() || 'N/A'}</p>`;
    defectInfoModal.classList.remove('hidden');
}

// --- Lógica de Processamento de Dados ---
function handleManualSave() {
    processCarId(manualCarIdInput.value.trim());
}

async function processCarId(carId) {
    if (!carId) return showNotification('O PJI do veículo não pode ser vazio.', 'error');
    if (!/^[0-9]+$/.test(carId)) return showNotification('PJI inválido. Use apenas números.', 'error');
    
    closeScannerModal();
    showNotification(`Veículo ${carId} recebido...`, 'info');

    try {
        const q = query(carsCollection, where("carId", "==", carId));
        const querySnapshot = await getDocs(q);
        const position = await getCurrentLocation();
        
        if (querySnapshot.empty) {
            await addDoc(carsCollection, { carId, lat: position.lat, lng: position.lng, timestamp: new Date(), status: 'parked' });
            showNotification(`Novo veículo ${carId} adicionado!`, 'success');
        } else {
            const docRef = doc(db, "parkedCars", querySnapshot.docs[0].id);
            await updateDoc(docRef, { lat: position.lat, lng: position.lng, timestamp: new Date(), status: 'parked' });
            showNotification(`Veículo ${carId} atualizado!`, 'success');
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
            error => reject(new Error("Não foi possível obter a localização.")),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    });
}

function showNotification(message, type = 'info') {
    const colors = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-blue-500' };
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 z-50 text-white px-4 py-3 rounded-lg shadow-lg ${colors[type]} animate-fadeIn`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.classList.add('animate-fadeOut');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function updateCarList(cars) {
    if (cars.length === 0) {
        carListDiv.innerHTML = `<div class="text-center py-10"><h3 class="mt-4 text-lg font-medium text-gray-900">Nenhum veículo no pátio</h3></div>`;
        return;
    }
    carListDiv.innerHTML = cars.map(car => `
        <div class="car-item bg-white rounded-lg shadow-sm overflow-hidden p-3 hover:bg-blue-50 transition-colors cursor-pointer" data-id="${car.id}" data-car-id="${car.carId}">
            <div class="flex-1">
                <div class="flex items-center justify-between">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${car.status === 'parked' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}">${car.status}</span>
                    <span class="text-xs text-gray-500">${timeAgo(car.timestamp)}</span>
                </div>
                <h3 class="mt-1 text-lg font-bold text-gray-900">${car.carId}</h3>
            </div>
        </div>`).join('');
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

// =================================================================
// 5. INICIALIZAÇÃO DA APLICAÇÃO
// =================================================================

function setupEventListeners() {
    scanBtn.addEventListener('click', openScannerModal);
    closeModalBtn.addEventListener('click', closeScannerModal);
    toggleManualBtn.addEventListener('click', toggleModalView);
    manualSaveBtn.addEventListener('click', handleManualSave);
    
    // Coordenadas atualizadas aqui
    locationBtn.addEventListener('click', () => {
        const fixedLat = -25.5259996;
        const fixedLng = -49.1231727;
        const fixedZoom = 14;
        map.flyTo([fixedLat, fixedLng], fixedZoom, { animate: true, duration: 1.5 });
    });
    
    filterBtn.addEventListener('click', handleFilterClick);
    refreshBtn.addEventListener('click', handleRefreshClick);
    searchInput.addEventListener('input', applyFiltersAndSearch);

    carListDiv.addEventListener('click', (e) => {
        const carItem = e.target.closest('.car-item');
        if (carItem) {
            const carId = carItem.dataset.carId; 
            if(carId) fetchAndShowDefects(carId);
        }
    });

    defectDetailsContainer.addEventListener('click', (e) => {
        if (e.target.closest('#back-to-list-btn')) {
            defectDetailsContainer.classList.add('hidden');
            carListContainer.classList.remove('hidden');
            scanBtn.classList.remove('hidden');
        }
        const defectItem = e.target.closest('.defect-item');
        if (defectItem) {
            showDefectDetailsModal(JSON.parse(defectItem.dataset.details));
        }
    });

    closeDefectModalBtn.addEventListener('click', () => defectInfoModal.classList.add('hidden'));
    defectModalOverlay.addEventListener('click', () => defectInfoModal.classList.add('hidden'));
}

function setupRealtimeUpdates() {
    const q = query(carsCollection, orderBy("timestamp", "desc"));
    
    onSnapshot(q, (snapshot) => {
        allCars = snapshot.docs.map(doc => ({
            id: doc.id,
            carId: doc.data().carId,
            lat: doc.data().lat,
            lng: doc.data().lng,
            status: doc.data().status,
            timestamp: doc.data().timestamp.toDate()
        }));
        
        applyFiltersAndSearch();
        // A LINHA ABAIXO ESTAVA FALTANDO, POR ISSO OS MARCADORES NÃO ERAM ATUALIZADOS
        updateMarkers(allCars);
    });
}

async function initApp() {
    try {
        initMap();
        setupEventListeners();
        setupRealtimeUpdates();
        
        await getCurrentLocation()
            .then(position => {
                map.flyTo([position.lat, position.lng], 15);
            })
            .catch(error => {
                console.log("Usando localização padrão devido a:", error);
            });
            
    } catch (error) {
        console.error("Erro fatal na inicialização:", error);
        showNotification("Erro ao iniciar o app: " + error.message, 'error');
    }
}

document.addEventListener('DOMContentLoaded', initApp);