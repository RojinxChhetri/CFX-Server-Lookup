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
                this.container.removeChild(toast);
            }, 300);
        }, duration);
    }

    getIconForType(type) {
        switch(type) {
            case 'error': return 'fa-exclamation-circle';
            case 'success': return 'fa-check-circle';
            case 'warning': return 'fa-exclamation-triangle';
            default: return 'fa-info-circle';
        }
    }
}

class CFXLookup {
    constructor() {
        this.initializeElements();
        this.initializeState();
        this.initializeEventListeners();
        this.toastManager = new ToastManager();
        this.setInitialTheme();
    }

    setInitialTheme() {
        this.setTheme('dark');  // Always start with dark mode
    }

    initializeElements() {
        this.elements = {
            body: document.body,
            themeToggle: document.getElementById('themeToggle'),
            serverAddress: document.getElementById('serverAddress'),
            lookupBtn: document.getElementById('lookupBtn'),
            loader: document.getElementById('loader'),
            error: document.getElementById('error'),
            errorText: document.getElementById('errorText'),
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
            playerList: document.getElementById('playerList')
        };

        // Add copy button to server IP
        const ipWrapper = document.createElement('div');
        ipWrapper.style.display = 'flex';
        ipWrapper.style.alignItems = 'center';
        
        const copyButton = document.createElement('button');
        copyButton.className = 'copy-button';
        copyButton.innerHTML = '<i class="fas fa-copy"></i>';
        copyButton.onclick = () => this.copyToClipboard('serverIP');
        
        this.elements.serverIP.parentNode.appendChild(copyButton);
    }

    initializeState() {
        this.currentServerData = null;
        this.players = [];  // Store player data
        this.isLoading = false;  // Track loading state
        this.autoRefreshInterval = null; // For auto-refresh
    }

    initializeEventListeners() {
        this.elements.themeToggle.addEventListener('click', () => this.toggleTheme());
        this.elements.lookupBtn.addEventListener('click', () => this.handleLookup());
        this.elements.serverAddress.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleLookup();
        });
        this.elements.playerSearch.addEventListener('input', () => this.filterPlayers());
        this.elements.playerSort.addEventListener('change', () => this.sortPlayers());
    }

    // Theme Management
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

    // Server Lookup and Data Handling
    async handleLookup() {
        this.hideError();
        this.showLoader();
        this.elements.serverInfo.classList.add('hidden');

        const input = this.elements.serverAddress.value.trim();
        const serverCode = this.extractServerCode(input);

        if (!serverCode) {
            this.toastManager.show('Invalid CFX address format', 'error');
            this.hideLoader();
            return;
        }

        try {
            // Check server status before fetching details
            const isOnline = await this.checkServerStatus(serverCode);
            if (!isOnline) {
                this.toastManager.show('Server is currently offline', 'warning');
                this.hideLoader();
                return;
            }

            // Fetch server data
            const serverResponse = await fetch(`https://servers-frontend.fivem.net/api/servers/single/${serverCode}`);
            const serverData = await serverResponse.json();

            if (!serverData.Data) {
                throw new Error('Server not found or offline');
            }

            const data = serverData.Data;
            let ipAddress = '';

            // Handle different server address formats
            if (input.includes('.users.cfx.re')) {
                try {
                    const endpointResponse = await fetch(
                        `https://${data.ownerName}-${serverCode}.users.cfx.re/client`,
                        {
                            method: 'POST',
                            body: 'method=getEndpoints',
                            headers: {
                                'Content-Type': 'text/plain'
                            }
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
            
            // Start auto-refresh for player data
            this.startAutoRefresh(serverCode);

            // Fetch and display server location info
            if (ipAddress && ipAddress !== 'Hidden') {
                await this.fetchLocationInfo(ipAddress.split(':')[0]);
            }

            this.toastManager.show('Server information retrieved successfully', 'success');
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
            return data.Data && data.Data.clients !== undefined;
        } catch {
            return false;
        }
    }

    // Fetch location info for IP address
    async fetchLocationInfo(ip) {
        try {
            // Use ipapi.co which supports CORS
            const locationResponse = await fetch(`https://ipapi.co/${ip}/json/`);
            const locationData = await locationResponse.json();
            
            if (!locationData.error) {
                this.elements.country.textContent = locationData.country_name || 'N/A';
                this.elements.city.textContent = locationData.city || 'N/A';
                this.elements.isp.textContent = locationData.org || 'N/A';
                this.elements.region.textContent = locationData.asn || 'N/A';
            } else {
                throw new Error('Location data not available');
            }
        } catch (error) {
            console.error('Location lookup error:', error);
            this.toastManager.show('Location lookup failed. Using fallback method.', 'warning');
            this.fetchLocationInfoFallback(ip);
        }
    }

    updateServerInfo(data, ipAddress) {
        this.elements.serverName.textContent = this.cleanServerName(data.hostname);
        this.elements.serverIP.textContent = ipAddress;
        this.elements.players.textContent = `${data.clients}/${data.sv_maxclients}`;
        this.elements.onesync.textContent = data.vars.onesync_enabled === 'true' ? 'Enabled' : 'Disabled';
        this.elements.gamebuild.textContent = data.vars.sv_enforceGameBuild || 'N/A';

        if (data.players) {
            this.players = data.players;
            this.updatePlayerList(data.players);
        }
    }

    cleanServerName(name) {
        return name.replace(/\^[0-9]/g, '').trim();
    }

    // Clipboard copy
    async copyToClipboard(elementId) {
        const text = document.getElementById(elementId).textContent;
        try {
            await navigator.clipboard.writeText(text);
            this.toastManager.show('Copied to clipboard!', 'success');
        } catch (err) {
            this.toastManager.show('Failed to copy text', 'error');
        }
    }

    // Loader and error handling
    showLoader() {
        this.isLoading = true;
        this.elements.loader.classList.remove('hidden');
    }

    hideLoader() {
        this.isLoading = false;
        this.elements.loader.classList.add('hidden');
    }

    showError(message) {
        this.elements.errorText.textContent = message;
        this.elements.error.classList.remove('hidden');
        this.elements.serverInfo.classList.add('hidden');
    }

    hideError() {
        this.elements.error.classList.add('hidden');
    }

    // Player list manipulation
    filterPlayers() {
        const query = this.elements.playerSearch.value.trim().toLowerCase();
        const filteredPlayers = this.players.filter(player => 
            player.name.toLowerCase().includes(query)
        );
        this.updatePlayerList(filteredPlayers);
    }

    sortPlayers() {
        const criteria = this.elements.playerSort.value;
        let sortedPlayers = [...this.players];

        if (criteria === 'name') {
            sortedPlayers.sort((a, b) => a.name.localeCompare(b.name));
        } else if (criteria === 'id') {
            sortedPlayers.sort((a, b) => a.id - b.id);
        } else if (criteria === 'ping') {
            sortedPlayers.sort((a, b) => a.ping - b.ping);
        }

        this.updatePlayerList(sortedPlayers);
    }

    updatePlayerList(players) {
        this.elements.playerList.innerHTML = '';  // Clear the existing list
        players.forEach(player => {
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

    // Start auto-refresh for player data every second
    startAutoRefresh(serverCode) {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval); // Clear any existing interval
        }
        this.autoRefreshInterval = setInterval(async () => {
            try {
                const serverResponse = await fetch(`https://servers-frontend.fivem.net/api/servers/single/${serverCode}`);
                const serverData = await serverResponse.json();

                if (serverData.Data) {
                    const data = serverData.Data;
                    if (data.players) {
                        this.players = data.players;
                        this.updatePlayerList(data.players); // Update the player list with fresh data
                    }
                }
            } catch (error) {
                console.error('Error refreshing player data:', error);
            }
        }, 1000); // Refresh every second
    }

    // Helper method to extract server code from input
    extractServerCode(input) {
        const match = input.match(/cfx\.re\/join\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
    }
}

// Initialize the app when DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => new CFXLookup());
