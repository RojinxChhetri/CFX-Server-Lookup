// Notification ko lagi
class ToastManager {
    constructor() {
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
    }

    show(message, type = 'error', duration = 5000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas ${this.getIconForType(type)}"></i>
            <span>${message}</span>
        `;

        this.container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                if (this.container.contains(toast)) {
                    this.container.removeChild(toast);
                }
            }, 300);
        }, duration);
    }

    getIconForType(type) {
        switch (type) {
            case 'error':
                return 'fa-exclamation-circle';
            case 'success':
                return 'fa-check-circle';
            case 'warning':
                return 'fa-exclamation-triangle';
            default:
                return 'fa-info-circle';
        }
    }
}

// Main class
class CFXLookup {
    constructor() {
        this.toastManager = new ToastManager();

        this.elements = {
            body: document.body,
            themeToggle: document.getElementById('themeToggle'),
            serverAddress: document.getElementById('serverAddress'),
            lookupBtn: document.getElementById('lookupBtn'),
            loader: document.getElementById('loader'),
            error: document.getElementById('error'),
            serverInfo: document.getElementById('serverInfo'),
            playerSearch: document.getElementById('playerSearch'),
            playerSort: document.getElementById('playerSort'),
            serverName: document.getElementById('serverName'),
            serverIP: document.getElementById('serverIP'),
            players: document.getElementById('players'),
            onesync: document.getElementById('onesync'),
            gamebuild: document.getElementById('gamebuild'),
            country: document.getElementById('country'),
            city: document.getElementById('city'),
            isp: document.getElementById('isp'),
            region: document.getElementById('region'),
            playerList: document.getElementById('playerList'),
        };

        this.addCopyButtonToServerIP();

        this.players = [];
        this.searchQuery = '';
        this.sortCriteria = 'name';
        this.autoRefreshInterval = null;

        this.setInitialTheme();
        this.setupEventListeners();
    }

    setInitialTheme() {
        this.setTheme('dark');
    }

    setTheme(theme) {
        this.elements.body.classList.remove('light-mode', 'dark-mode');
        this.elements.body.classList.add(`${theme}-mode`);
        this.updateThemeIcon(theme);
        localStorage.setItem('cfx-lookup-theme', theme);
    }

    toggleTheme() {
        const currentTheme = this.elements.body.classList.contains('light-mode') ? 'light' : 'dark';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
    }

    updateThemeIcon(theme) {
        const icon = this.elements.themeToggle.querySelector('i');
        icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }

    setupEventListeners() {
        this.elements.themeToggle.addEventListener('click', () => this.toggleTheme());
        this.elements.lookupBtn.addEventListener('click', () => this.handleLookup());
        this.elements.serverAddress.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleLookup();
        });

        // Player search and sort
        this.elements.playerSearch.addEventListener('input', () => {
            this.searchQuery = this.elements.playerSearch.value.trim().toLowerCase();
            this.updatePlayerList(); // Refresh list with new filter
        });
        this.elements.playerSort.addEventListener('change', () => {
            this.sortCriteria = this.elements.playerSort.value;
            this.updatePlayerList(); // Refresh list with new sort
        });
    }

    async handleLookup() {
        this.hideError();
        this.showLoader();
        this.elements.serverInfo.classList.add('hidden');

        const input = this.elements.serverAddress.value.trim();
        const serverCode = this.extractServerCode(input);

        if (!serverCode) {
            this.toastManager.show('Invalid CFX address format.', 'error');
            this.hideLoader();
            return;
        }

        try {
            const isOnline = await this.checkServerStatus(serverCode);
            if (!isOnline) {
                this.toastManager.show('Server is currently offline or not found.', 'warning');
                this.hideLoader();
                return;
            }

            const serverResponse = await fetch(
                `https://servers-frontend.fivem.net/api/servers/single/${serverCode}`
            );
            const serverData = await serverResponse.json();
            if (!serverData.Data) {
                throw new Error('Server not found or offline.');
            }

            const data = serverData.Data;
            let ipAddress = '';
            // Dherai janne manxey haru ko lagi
            if (input.includes('.users.cfx.re')) {
                try {
                    const endpointResponse = await fetch(
                        `https://${data.ownerName}-${serverCode}.users.cfx.re/client`,
                        {
                            method: 'POST',
                            body: 'method=getEndpoints',
                            headers: { 'Content-Type': 'text/plain' },
                        }
                    );
                    const endpoints = await endpointResponse.json();
                    ipAddress = endpoints[0];
                } catch (error) {
                    ipAddress = data.connectEndPoints[0] || 'Hidden';
                }
            } else {
                ipAddress = data.connectEndPoints[0] || 'Hidden';
            }

            this.updateServerInfo(data, ipAddress);

            this.startAutoRefresh(serverCode);

            if (ipAddress && ipAddress !== 'Hidden') {
                await this.fetchLocationInfo(ipAddress.split(':')[0]);
            }

            this.toastManager.show('Server information retrieved successfully!', 'success');
            this.elements.serverInfo.classList.remove('hidden');
        } catch (error) {
            this.toastManager.show(error.message, 'error');
        } finally {
            this.hideLoader();
        }
    }

    async checkServerStatus(serverCode) {
        try {
            const response = await fetch(`https://servers-frontend.fivem.net/api/servers/single/${serverCode}`);
            const data = await response.json();
            return data?.Data && data.Data?.clients !== undefined;
        } catch (err) {
            return false;
        }
    }

    extractServerCode(input) {
        // 1) If it matches a direct cfx code, e.g. "abc123"
        if (/^[a-zA-Z0-9]{6,}$/.test(input)) {
            return input;
        }

        // 2) If it's a link with cfx.re/join/xxxxx
        const match = input.match(/(?:https?:\/\/)?cfx\.re\/join\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
    }

    startAutoRefresh(serverCode) {
        // Clear any old intervals
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }

        // Refresh player list every second
        this.autoRefreshInterval = setInterval(async () => {
            try {
                const response = await fetch(
                    `https://servers-frontend.fivem.net/api/servers/single/${serverCode}`
                );
                const data = await response.json();
                if (data.Data && data.Data.players) {
                    this.players = data.Data.players;
                    this.updatePlayerList(); // re-render updated players
                }
            } catch (error) {
                console.error('Error refreshing player data:', error);
            }
        }, 1000);
    }

    updateServerInfo(data, ipAddress) {
        // Basic server info
        this.elements.serverName.textContent = this.cleanServerName(data.hostname);
        this.elements.serverIP.textContent = ipAddress;
        this.elements.players.textContent = `${data.clients}/${data.sv_maxclients}`;
        this.elements.onesync.textContent = data.vars.onesync_enabled === 'true' ? 'Enabled' : 'Disabled';
        this.elements.gamebuild.textContent = data.vars.sv_enforceGameBuild || 'N/A';

        // Update player data in memory, then render them
        this.players = data.players || [];
        this.searchQuery = ''; // reset search on fresh load
        this.elements.playerSearch.value = '';
        this.sortCriteria = 'name';
        this.elements.playerSort.value = 'name';
        this.updatePlayerList();
    }

    cleanServerName(name) {
        // Remove any color codes like ^1, ^2 etc.
        return name.replace(/\^[0-9]/g, '').trim();
    }


    // Thau ko name haru ko location fetch garna
    async fetchLocationInfo(ip) {
        try {
            const locationResponse = await fetch(`https://ipapi.co/${ip}/json/`);
            const locationData = await locationResponse.json();
            if (locationData.error) {
                throw new Error('Location data not available.');
            }

            // Update location fields
            this.elements.country.textContent = locationData.country_name || 'N/A';
            this.elements.city.textContent = locationData.city || 'N/A';
            this.elements.isp.textContent = locationData.org || 'N/A';
            // ipapi.co often stores the region name in "region", 
            // region_code in "region_code" etc. 
            this.elements.region.textContent = locationData.region || 'N/A';
        } catch (error) {
            console.warn('Location lookup error:', error);
            this.toastManager.show('Location lookup failed.', 'warning');
            // If you have fallback logic, you can call it here.
        }
    }

    
    updatePlayerList() {
        // 1) Filter
        let filtered = this.players.filter((p) =>
            p.name.toLowerCase().includes(this.searchQuery)
        );

        // 2) Sort
        if (this.sortCriteria === 'name') {
            filtered.sort((a, b) => a.name.localeCompare(b.name));
        } else if (this.sortCriteria === 'id') {
            filtered.sort((a, b) => a.id - b.id);
        } else if (this.sortCriteria === 'ping') {
            filtered.sort((a, b) => a.ping - b.ping);
        }

        // 3) Render
        this.elements.playerList.innerHTML = '';
        filtered.forEach((player) => {
            const playerItem = document.createElement('div');
            playerItem.className = 'player-item';
            playerItem.innerHTML = `
                <div class="player-info">
                    <span class="player-name">${this.escapeHtml(player.name)}</span>
                    <span class="player-id">#${player.id}</span>
                </div>
                <div class="player-stats">
                    <div class="stat">
                        <div class="stat-label">Ping</div>
                        <div class="stat-value">${player.ping}ms</div>
                    </div>
                </div>
            `;
            this.elements.playerList.appendChild(playerItem);
        });
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    addCopyButtonToServerIP() {
        const copyButton = document.createElement('button');
        copyButton.className = 'copy-button';
        copyButton.innerHTML = '<i class="fas fa-copy"></i>';
        copyButton.onclick = () => this.copyToClipboard('serverIP');

        const parent = this.elements.serverIP.parentNode;
        parent.style.display = 'flex';
        parent.style.alignItems = 'center';
        parent.appendChild(copyButton);
    }

    async copyToClipboard(elementId) {
        const text = document.getElementById(elementId).textContent;
        try {
            await navigator.clipboard.writeText(text);
            this.toastManager.show('Copied to clipboard!', 'success');
        } catch (err) {
            this.toastManager.show('Failed to copy text.', 'error');
        }
    }

    showLoader() {
        this.elements.loader.classList.remove('hidden');
    }

    hideLoader() {
        this.elements.loader.classList.add('hidden');
    }

    hideError() {
        this.elements.error.classList.add('hidden');
    }
}

    // Suru choti call garna
document.addEventListener('DOMContentLoaded', () => new CFXLookup());
