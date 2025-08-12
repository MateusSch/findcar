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
const loadingOverlay = document.getElementById('loading-overlay');
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
const lookerFilterBtn = document.getElementById('looker-filter-btn');
const lookerFilterModal = document.getElementById('looker-filter-modal');
const lookerFilterOverlay = document.getElementById('looker-filter-overlay');
const defectFilterOptionsDiv = document.getElementById('defect-filter-options');
const applyLookerFilterBtn = document.getElementById('apply-looker-filter-btn');
const closeLookerFilterBtn = document.getElementById('close-looker-filter-btn');
const nfcScanModal = document.getElementById('nfc-scan-modal');
const cancelNfcScanBtn = document.getElementById('cancel-nfc-scan-btn');


// =================================================================
// 3. ESTADO GLOBAL E CONSTANTES
// =================================================================
let map, markers = {}, html5QrCode = null, allCars = [], currentFilter = 'all';
let currentlySelectedDocId = null;
let defectCarIds = [];
let carDefects = {};
let currentCarIdForNfc = null;
let nfcController = null;

const defectFilterValues = [
    "ABERTO: ASPECTO", "ABERTO: DEF FUNCIONAMENTO", "ABERTO: DEF MECANICO",
    "ABERTO: DEFEITO GSAO", "ABERTO: DEGRADAÇÃO", "ABERTO: ENCHIMENTO",
    "ABERTO: ESTANQUEIDADE", "ABERTO: GEOMETRIA","ABERTO: RUIDO",
    "ABERTO: DEF ELETRICO", "DEFEITO ABERTO ELÉTRICO", "DEFEITO ABERTO RUÍDOS",
    "DEFEITO ABERTO S.A.O", "DEFEITO ABERTO: SAO"
];

// Mapeia cada tipo de defeito a uma cor. Sinta-se à vontade para alterar as cores.
const defectColorMap = {
    "ABERTO: GEOMETRIA": "#E74C3C",   // Vermelho
    "ABERTO: RUIDO": "#F39C12",       // Laranja
    "DEFEITO ABERTO RUÍDOS": "#F39C12", // Laranja
    "ABERTO: DEF ELETRICO": "#F1C40F", // Amarelo
    "DEFEITO ABERTO ELÉTRICO": "#F1C40F", // Amarelo
    "ABERTO: ESTANQUEIDADE": "#3498DB", // Azul
    "ABERTO: DEF MECANICO": "#9B59B6", // Roxo
    "ABERTO: DEGRADAÇÃO": "#1ABC9C",   // Turquesa
    "ABERTO: ENCHIMENTO": "#2ECC71",   // Verde Esmeralda
    "ABERTO: ASPECTO": "#E67E22",      // Cenoura
    "ABERTO: DEF FUNCIONAMENTO": "#D35400", // Laranja Escuro
    "ABERTO: DEFEITO GSAO": "#7F8C8D", // Cinza
    "DEFEITO ABERTO S.A.O": "#7F8C8D", // Cinza
    "DEFEITO ABERTO: SAO": "#7F8C8D",  // Cinza
};

const DEFAULT_PIN_COLOR = '#888888'; // Cinza para carros sem defeito ou com defeito não mapeado

// =================================================================
// 4. DEFINIÇÃO DE TODAS AS FUNÇÕES
// =================================================================

function createColoredIcon(color) {
    // O SVG não precisa mais do 'style' de transformação, pois o L.DivIcon cuida do posicionamento.
    const iconHtml = `
    <svg viewBox="0 0 24 24" width="32" height="32">
        <path fill="${color}" stroke="#000" stroke-width="1" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>`;

    return L.divIcon({
        html: iconHtml,
        className: 'custom-div-icon', // Classe CSS para remover estilos padrão
        iconSize: [32, 32],
        iconAnchor: [16, 32],      // Ponto de ancoragem na ponta inferior do pino
        popupAnchor: [0, -32],     // Posição do popup em relação ao ícone
    });
}

function updateMarkers(cars) {
    Object.values(markers).forEach(marker => marker.remove());
    markers = {};
    cars.forEach(car => {
        const defects = carDefects[car.carId];
        let pinColor = DEFAULT_PIN_COLOR;

        if (defects && defects.length > 0) {
            // Pega o primeiro defeito da lista para definir a cor
            const firstDefect = defects[0];
            pinColor = defectColorMap[firstDefect] || DEFAULT_PIN_COLOR;
        }

        const icon = createColoredIcon(pinColor);

        const marker = L.marker([car.lat, car.lng], { icon }) // Usa o novo ícone
            .addTo(map)
            .bindPopup(`<div class="font-bold">${car.carId}</div>`);

        marker.on('click', () => {
            showLookerDashboard(car);
        });
        markers[car.id] = marker;
    });
}


function initMap() {
    map = L.map(mapElement, { zoomControl: false, tap: false }).setView([-25.4411, -49.2731], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
}

function focusOnCar(docId) {
    if (markers[docId]) {
        const marker = markers[docId];
        map.flyTo(marker.getLatLng(), 18, { animate: true, duration: 1 });
        marker.openPopup();
    }
}

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

async function applyLookerFilter() {
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

    const lookerData = await fetchLookerData(allPJIs, selectedDefects);

    if (lookerData && lookerData.length > 0) {
        const uniquePjisWithDefects = [...new Set(lookerData.map(item => item['vehicle.PJI']))];
        defectCarIds = uniquePjisWithDefects.map(pji => pji.substring(5));
        showNotification(`${defectCarIds.length} veículos com defeitos encontrados.`, 'success');
    } else {
        defectCarIds = [];
        showNotification('Nenhum veículo encontrado com os defeitos selecionados.', 'info');
    }

    applyFiltersAndSearch();
    lookerFilterModal.classList.add('hidden');
}

async function showLookerDashboard(car) {
    focusOnCar(car.id);
    changeStatusBtn.classList.remove('hidden');
    changeStatusBtn.dataset.docId = car.id;
    changeStatusBtn.dataset.currentStatus = car.status;
    carListContainer.classList.add('hidden');
    defectDetailsContainer.classList.remove('hidden');
    scanBtn.classList.add('hidden');
    document.getElementById('app-container').classList.add('details-view-active');

    const pjiFilter = [`65625${car.carId}`];
    const allDefectTypes = defectFilterValues;

    defectDetailsContainer.innerHTML = `
        <div class="sticky top-0 bg-white p-3 border-b border-gray-200 z-10">
            <div class="flex items-center">
                <button id="back-to-list-btn" class="p-2 mr-2 rounded-full hover:bg-gray-200">
                    <svg class="h-6 w-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                </button>
                <div>
                    <h2 class="text-xl font-bold text-gray-800">${car.carId}</h2>
                    <p class="text-sm text-gray-600">Buscando dados de Qualidade...</p>
                </div>
            </div>
        </div>
        <div id="looker-data-content" class="p-4"><div class="text-center py-10">Carregando...</div></div>
    `;

    document.getElementById('back-to-list-btn').addEventListener('click', () => {
         defectDetailsContainer.classList.add('hidden');
         carListContainer.classList.remove('hidden');
         scanBtn.classList.remove('hidden');
         changeStatusBtn.classList.add('hidden');
         document.getElementById('app-container').classList.remove('details-view-active');
    });

    const lookerData = await fetchLookerData(pjiFilter, allDefectTypes);

    const contentDiv = document.getElementById('looker-data-content');
    if (lookerData && lookerData.length > 0) {
        contentDiv.innerHTML = lookerData.map(item => `
            <div class="bg-white p-3 mb-2 rounded-lg shadow-sm">
                <p class="font-bold">${item['vehicle_production_defect.repair_code_label'] || 'Defeito não especificado'}</p>
                <p class="text-sm text-gray-600">${item['incident_final.incident_label'] || 'Incidente não especificado'}</p>
                <p class="text-xs text-gray-500 mt-1">Elemento: ${item['element_final.element_label'] || 'N/A'}</p>
            </div>
        `).join('');
    } else {
        contentDiv.innerHTML = `<p class="text-center text-gray-600">Nenhum dado de defeito encontrado no Looker para este veículo.</p>`;
    }
}


// --- ATUALIZAÇÃO: fetchLookerData não precisa mais da notificação de sucesso ---
async function fetchLookerData(pjis, labels) {
    const cloudFunctionUrl = "https://get-looker-data-n6ubzhbssa-rj.a.run.app";
    loadingOverlay.classList.remove('hidden');
    try {
        const response = await fetch(cloudFunctionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pjis: pjis.join(','), labels: labels.join(',') })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro ${response.status}: ${errorText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Erro ao buscar dados do Looker:', error);
        showNotification(`Erro ao buscar dados: ${error.message}`, 'error');
        return [];
    } finally {
        loadingOverlay.classList.add('hidden');
    }
}

// --- NOVO: Função para buscar todos os defeitos de todos os carros ---
async function fetchAllCarDefects(cars) {
    if (cars.length === 0) return;

    const allPJIs = cars.map(car => `65625${car.carId}`);
    // Busca por todos os tipos de defeito definidos
    const lookerData = await fetchLookerData(allPJIs, defectFilterValues);

    if (lookerData && lookerData.length > 0) {
        // Agrupa os defeitos por PJI
        const defectsByPji = lookerData.reduce((acc, defect) => {
            const pji = defect['vehicle.PJI'];
            const label = defect['vehicle_production_defect.repair_code_label'];
            if (!acc[pji]) {
                acc[pji] = [];
            }
            acc[pji].push(label);
            return acc;
        }, {});

        // Converte os PJIs de volta para carId e armazena no estado global
        carDefects = {}; // Limpa o estado anterior
        for (const pji in defectsByPji) {
            const carId = pji.substring(5);
            carDefects[carId] = defectsByPji[pji];
        }
        console.log("Defeitos por carro:", carDefects);
        // Força a atualização do mapa com as novas cores
        applyFiltersAndSearch();
    }
}

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
    const finalCarId = carId.substring(0, 7);
    if (!finalCarId || !/^[0-9]+$/.test(finalCarId)) {
        return showNotification('ID do veículo inválido.', 'error');
    }
    
    closeScannerModal();
    currentCarIdForNfc = finalCarId; // Armazena o ID do carro

    // Verifica se a Web NFC API está disponível
    if ('NDEFReader' in window) {
        startNfcScan();
    } else {
        showNotification("Web NFC não suportado. Salve o carro sem a tag.", 'info');
        // Se não houver suporte, salva o carro apenas com a localização
        await saveCarData(finalCarId, null);
    }
}

function openNfcModal() {
    nfcScanModal.classList.remove('hidden');
}

function closeNfcModal() {
    if (nfcController) {
        nfcController.abort(); // Cancela a operação de scan
        nfcController = null;
    }
    nfcScanModal.classList.add('hidden');
} 

async function startNfcScan() {
    openNfcModal();
    try {
        const ndef = new NDEFReader();
        nfcController = new AbortController();

        await ndef.scan({ signal: nfcController.signal });

        ndef.addEventListener('reading', async ({ serialNumber }) => {
            console.log(`Tag NFC (Hex Original): ${serialNumber}`);

            // 1. Remove os dois pontos do serial number hexadecimal.
            // Ex: "04:d1:6c:92:ab:1f:90" -> "04d16c92ab1f90"
            const hexSerialNumber = serialNumber.replace(/:/g, '');

            // 2. Converte a string hexadecimal para um número decimal.
            const decimalSerialNumber = parseInt(hexSerialNumber, 16);

            // 3. Converte o número decimal para uma string para salvar no banco.
            const standardizedSerialNumber = decimalSerialNumber.toString();

            console.log(`Tag NFC (Decimal Padronizado): ${standardizedSerialNumber}`);

            closeNfcModal();
            // Salva o ID já padronizado no formato decimal.
            await saveCarData(currentCarIdForNfc, standardizedSerialNumber);
        });

        ndef.addEventListener('error', (event) => {
            showNotification('Erro na leitura da tag NFC. Tente novamente.', 'error');
            console.error("NFC Error:", event);
            closeNfcModal();
        });

    } catch (error) {
        showNotification(`Erro ao iniciar NFC: ${error.message}`, 'error');
        console.error("Erro ao iniciar o scanner NFC:", error);
        closeNfcModal();
    }
}

async function saveCarData(carId, nfcTagId) {
    showNotification(`Processando veículo ${carId}...`, 'info');
    try {
        const q = query(carsCollection, where("carId", "==", carId));
        const querySnapshot = await getDocs(q);
        const position = await getCurrentLocation();
        
        const carData = {
            carId: carId,
            lat: position.lat,
            lng: position.lng,
            timestamp: new Date(),
            status: 'parked',
            nfcTagId: nfcTagId || null // Adiciona o ID da tag NFC ou null
        };

        if (querySnapshot.empty) {
            await addDoc(carsCollection, carData);
            showNotification(`Novo veículo ${carId} adicionado com tag NFC!`, 'success');
        } else {
            const docRef = doc(db, "parkedCars", querySnapshot.docs[0].id);
            await updateDoc(docRef, carData);
            showNotification(`Veículo ${carId} atualizado com tag NFC!`, 'success');
        }
    } catch (error) {
        showNotification(`Erro ao salvar dados: ${error.message}`, 'error');
    } finally {
        currentCarIdForNfc = null; // Limpa o estado
    }
}

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
        carListDiv.innerHTML = `<div class="text-center py-10"><h3 class="mt-4 text-lg font-medium text-gray-900">Nenhum veículo encontrado</h3><p class="text-sm text-gray-500">Tente ajustar seus filtros.</p></div>`;
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

    if (defectCarIds.length > 0) {
        processedCars = processedCars.filter(car => defectCarIds.includes(car.carId));
    }

    if (currentFilter !== 'all') {
        processedCars = processedCars.filter(car => car.status === currentFilter);
    }

    const searchTerm = searchInput.value.toLowerCase();
    if (searchTerm) {
        processedCars = processedCars.filter(car => car.carId.toLowerCase().includes(searchTerm));
    }

    updateCarList(processedCars);
    updateMarkers(processedCars);

    if (processedCars.length > 0) {
        const bounds = L.latLngBounds(processedCars.map(car => [car.lat, car.lng]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
    }
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
    defectCarIds = [];
    applyFiltersAndSearch();
    // Ao atualizar, busca novamente os defeitos de todos os carros
    fetchAllCarDefects(allCars);
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

    saveStatusBtn.addEventListener('click', handleChangeStatus);
    closeStatusModalBtn.addEventListener('click', () => changeStatusModal.classList.add('hidden'));
    statusModalOverlay.addEventListener('click', () => changeStatusModal.classList.add('hidden'));

    lookerFilterBtn.addEventListener('click', openLookerFilterModal);
    closeLookerFilterBtn.addEventListener('click', () => lookerFilterModal.classList.add('hidden'));
    lookerFilterOverlay.addEventListener('click', () => lookerFilterModal.classList.add('hidden'));
    applyLookerFilterBtn.addEventListener('click', applyLookerFilter);
    cancelNfcScanBtn.addEventListener('click', closeNfcModal);
}

function setupRealtimeUpdates() {
    const q = query(carsCollection, orderBy("timestamp", "desc"));
    onSnapshot(q, (snapshot) => {
        const firstLoad = allCars.length === 0;
        allCars = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), timestamp: doc.data().timestamp.toDate() }));
        
        // Aplica filtros imediatamente para mostrar os carros na lista e no mapa (com cor padrão)
        applyFiltersAndSearch();

        // Se for a primeira carga de dados, busca os defeitos de todos os carros em segundo plano
        if (firstLoad) {
            showNotification("Buscando status de defeitos...", "info");
            fetchAllCarDefects(allCars);
        }
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