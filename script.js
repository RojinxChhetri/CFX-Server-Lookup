// Manages toast notifications for user feedback
class ToastManager {
    constructor() {
        this.container = document.createElement('div');
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
    }

    // Displays a toast with message, type, and duration
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
            setTimeout(() => this.container.removeChild(toast), 300);
        }, duration);
    }

    // Returns appropriate icon based on toast type
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

// Main class handling all CFX lookup functionality
class CFXLookup {
    constructor() {
        this.toastManager = new ToastManager();
        this.isLookingUp = false;
        this.lookupCount = 0;
        this.lastLookupTime = 0;

        // DOM elements
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
            downloadPDFBtn: document.getElementById('downloadPDFBtn'),
        };

        this.addCopyButtonToServerIP();
        this.players = [];
        this.searchQuery = '';
        this.sortCriteria = 'name';

        this.setInitialTheme();
        this.setupEventListeners();
    }

    // Sets initial theme based on saved preference or defaults to dark
    setInitialTheme() {
        const savedTheme = localStorage.getItem('cfx-lookup-theme') || 'dark';
        this.setTheme(savedTheme);
    }

    // Applies the specified theme to the body and saves it
    setTheme(theme) {
        this.elements.body.classList.remove('light-mode', 'dark-mode');
        this.elements.body.classList.add(`${theme}-mode`);
        this.updateThemeIcon(theme);
        localStorage.setItem('cfx-lookup-theme', theme);
    }

    // Toggles between light and dark themes
    toggleTheme() {
        const currentTheme = this.elements.body.classList.contains('light-mode')
            ? 'light'
            : 'dark';
        this.setTheme(currentTheme === 'light' ? 'dark' : 'light');
    }

    // Updates the theme toggle icon
    updateThemeIcon(theme) {
        const icon = this.elements.themeToggle.querySelector('i');
        icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }

    // Sets up all event listeners
    setupEventListeners() {
        this.elements.themeToggle.addEventListener('click', () => this.toggleTheme());
        this.elements.lookupBtn.addEventListener('click', () => this.handleLookup());
        this.elements.serverAddress.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleLookup();
        });
        this.elements.playerSearch.addEventListener('input', () => {
            this.searchQuery = this.elements.playerSearch.value.trim().toLowerCase();
            this.updatePlayerList();
        });
        this.elements.playerSort.addEventListener('change', () => {
            this.sortCriteria = this.elements.playerSort.value;
            this.updatePlayerList();
        });
        this.elements.downloadPDFBtn.addEventListener('click', () => this.downloadPDF());
    }

    // Handles the server lookup process with simple throttling
    async handleLookup() {
        const now = Date.now();
        if (now - this.lastLookupTime < 5000) {
            this.toastManager.show(
                'Please wait a moment before performing another lookup.',
                'warning'
            );
            return;
        }
        this.lastLookupTime = now;
        this.lookupCount++;

        if (this.isLookingUp) {
            this.toastManager.show(
                'Please wait for the current lookup to finish.',
                'warning'
            );
            return;
        }

        this.isLookingUp = true;
        this.hideError();
        this.showLoader();
        this.elements.serverInfo.classList.add('hidden');

        const input = this.elements.serverAddress.value.trim();
        const serverCode = this.extractServerCode(input);

        if (!serverCode) {
            this.toastManager.show(
                'Invalid CFX address format. Use e.g., "abc123" or "https://cfx.re/join/abc123".',
                'error'
            );
            this.hideLoader();
            this.isLookingUp = false;
            return;
        }

        try {
            const isOnline = await this.checkServerStatus(serverCode);
            if (!isOnline) {
                this.toastManager.show('Server is offline or not found.', 'warning');
                this.hideLoader();
                return;
            }

            const serverResponse = await fetch(
                `https://servers-frontend.fivem.net/api/servers/single/${serverCode}`
            );
            const serverData = await serverResponse.json();
            if (!serverData.Data) throw new Error('Server data unavailable.');

            const data = serverData.Data;
            let ipAddress = data.connectEndPoints[0] || 'Hidden';

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
                    ipAddress = endpoints[0] || ipAddress;
                } catch (error) {
                    console.warn('Failed to fetch endpoints:', error);
                }
            }

            this.updateServerInfo(data, ipAddress);

            if (ipAddress !== 'Hidden') {
                await this.fetchLocationInfo(ipAddress.split(':')[0]);
            }

            this.toastManager.show('Server information retrieved successfully!', 'success');
            this.elements.serverInfo.classList.remove('hidden');
        } catch (error) {
            this.toastManager.show(`Error: ${error.message}`, 'error');
        } finally {
            this.hideLoader();
            this.isLookingUp = false;
        }
    }

    // Checks if the server is online
    async checkServerStatus(serverCode) {
        try {
            const response = await fetch(
                `https://servers-frontend.fivem.net/api/servers/single/${serverCode}`
            );
            const data = await response.json();
            return data?.Data?.clients !== undefined;
        } catch (error) {
            return false;
        }
    }

    // Extracts server code from input (direct code or URL)
    extractServerCode(input) {
        if (/^[a-zA-Z0-9]{6,}$/.test(input)) return input;
        const match = input.match(/(?:https?:\/\/)?cfx\.re\/join\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
    }

    // Updates server info UI
    updateServerInfo(data, ipAddress) {
        this.elements.serverName.textContent = this.cleanServerName(data.hostname);
        this.elements.serverIP.textContent = ipAddress;
        const maxClients =
            data.sv_maxclients ||
            (data.vars ? data.vars.sv_maxclients || data.vars.sv_maxClients : null) ||
            'N/A';
        this.elements.players.textContent = `${data.clients}/${maxClients}`;
        this.elements.onesync.textContent =
            data.vars.onesync_enabled === 'true' ? 'Enabled' : 'Disabled';
        this.elements.gamebuild.textContent = data.vars.sv_enforceGameBuild || 'N/A';

        this.players = data.players || [];
        this.searchQuery = '';
        this.elements.playerSearch.value = '';
        this.sortCriteria = 'name';
        this.elements.playerSort.value = 'name';
        this.updatePlayerList();
    }

    // Removes color codes from server name
    cleanServerName(name) {
        return name.replace(/\^[0-9]/g, '').trim();
    }

    // Fetches and updates location info based on IP
    async fetchLocationInfo(ip) {
        try {
            const response = await fetch(`https://ipapi.co/${ip}/json/`);
            const data = await response.json();
            if (data.error) throw new Error(data.reason);
            this.elements.country.textContent = data.country_name || 'N/A';
            this.elements.city.textContent = data.city || 'N/A';
            this.elements.isp.textContent = data.org || 'N/A';
            this.elements.region.textContent = data.region || 'N/A';
        } catch (error) {
            this.toastManager.show('Location lookup failed.', 'warning');
        }
    }

    // Updates the player list with filtering and sorting
    updatePlayerList() {
        let filtered = this.players.filter((p) =>
            p.name.toLowerCase().includes(this.searchQuery)
        );

        switch (this.sortCriteria) {
            case 'name':
                filtered.sort((a, b) => a.name.localeCompare(b.name));
                break;
            case 'id':
                filtered.sort((a, b) => a.id - b.id);
                break;
            case 'ping':
                filtered.sort((a, b) => a.ping - b.ping);
                break;
        }

        this.elements.playerList.innerHTML = '';
        if (filtered.length === 0) {
            const noPlayers = document.createElement('div');
            noPlayers.className = 'no-players';
            noPlayers.textContent = 'No players found';
            this.elements.playerList.appendChild(noPlayers);
        } else {
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
    }

    // Escapes HTML to prevent XSS
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Adds a copy button to the server IP field
    addCopyButtonToServerIP() {
        const copyButton = document.createElement('button');
        copyButton.className = 'copy-button';
        copyButton.innerHTML = '<i class="fas fa-copy"></i>';
        copyButton.title = 'Copy server IP';
        copyButton.setAttribute('aria-label', 'Copy server IP');
        copyButton.onclick = () => this.copyToClipboard('serverIP');
        const parent = this.elements.serverIP.parentNode;
        parent.style.display = 'flex';
        parent.style.alignItems = 'center';
        parent.appendChild(copyButton);
    }

    // Copies text to clipboard
    async copyToClipboard(elementId) {
        try {
            const text = document.getElementById(elementId).textContent;
            await navigator.clipboard.writeText(text);
            this.toastManager.show('Copied to clipboard!', 'success');
        } catch (error) {
            this.toastManager.show('Failed to copy text.', 'error');
        }
    }

    // Creates a PDF with enhanced server details and player list
    downloadPDF() {
        // Check if server info is available
        if (
            !this.elements.serverName.textContent.trim() ||
            !this.elements.serverIP.textContent.trim()
        ) {
            this.toastManager.show('No server information to generate PDF.', 'warning');
            return;
        }

        const { jsPDF } = window.jspdf;
        if (!jsPDF) {
            this.toastManager.show('jsPDF library not loaded properly.', 'error');
            return;
        }

        const doc = new jsPDF({
            orientation: 'p',
            unit: 'pt',
            format: 'letter',
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 40;

        // Title: "Server Information" (centered, bold)
        const title = 'Server Information';
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        const titleWidth = doc.getTextDimensions(title).w;
        const xTitle = (pageWidth - titleWidth) / 2;
        doc.text(title, xTitle, 50);

        // Generated on: Date and Time (left-aligned)
        const generatedOn = `Generated on: ${new Date().toLocaleString()}`;
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(generatedOn, margin, 70);

        // Server Details section (centered and bold)
        const serverDetailsTitle = 'Server Details';
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        const serverDetailsWidth = doc.getTextDimensions(serverDetailsTitle).w;
        const xServerDetails = (pageWidth - serverDetailsWidth) / 2;
        doc.text(serverDetailsTitle, xServerDetails, 90);

        let y = 110;
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        const details = [
            `Name: ${this.elements.serverName.textContent}`,
            `IP: ${this.elements.serverIP.textContent}`,
            `Players: ${this.elements.players.textContent}`,
            `OneSync: ${this.elements.onesync.textContent}`,
            `Game Build: ${this.elements.gamebuild.textContent}`,
        ];
        details.forEach((line) => {
            const textWidth = doc.getTextDimensions(line).w;
            const xCentered = (pageWidth - textWidth) / 2;
            doc.text(line, xCentered, y);
            y += 15;
        });

        // Location Info section (left-aligned)
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('Location Info', margin, y + 10);
        y += 30;
        doc.setFontSize(12);
        doc.setFont(undefined, 'normal');
        doc.text(`Country: ${this.elements.country.textContent}`, margin, y);
        y += 15;
        doc.text(`City: ${this.elements.city.textContent}`, margin, y);
        y += 15;
        doc.text(`ISP: ${this.elements.isp.textContent}`, margin, y);
        y += 15;
        doc.text(`Region: ${this.elements.region.textContent}`, margin, y);
        y += 20;

        // Active Players section (left-aligned)
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('Active Players', margin, y);
        y += 15;

        // Player list header (bold)
        doc.setFont(undefined, 'bold');
        doc.text('ID', margin, y);
        doc.text('Name', margin + 60, y);
        doc.text('Ping', margin + 360, y);
        y += 15;

        // Player list (normal font with proper spacing)
        doc.setFontSize(12);
        doc.setFont(undefined, 'normal');
        if (!this.players || this.players.length === 0) {
            doc.text('No players available.', margin, y);
        } else {
            this.players.forEach((p) => {
                if (y > 700) {
                    doc.addPage();
                    y = 40;
                }
                doc.text(p.id.toString(), margin, y);
                doc.text(p.name, margin + 60, y);
                doc.text(`${p.ping}ms`, margin + 360, y);
                y += 20; // Increased spacing for readability
            });
        }

        // Save the PDF
        const sanitizedName = this.elements.serverName.textContent.replace(/\s+/g, '_');
        doc.save(`server_${sanitizedName}.pdf`);
        this.toastManager.show('PDF generated successfully!', 'success');
    }

    // Utility methods
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

// Initialize the CFX Lookup tool on page load
document.addEventListener('DOMContentLoaded', () => new CFXLookup());
