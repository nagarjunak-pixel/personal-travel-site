// Application Logic for Wanderlust Personal Travel Site

// App State
let travelData = null;
let activeTab = 'dashboard';
let map = null;
let tileLayer = null;
let markerClusterGroup = null;
let charts = {};

// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    initTabs();
    initGlobalSearch();
    await loadData();
    initMap();
    renderDashboard();
    renderTimeline();
    renderInstagramQueue();
    initModal();
});

// Load geocoded travel data from JSON
async function loadData() {
    try {
        console.log("Fetching travel data...");
        const response = await fetch('data/travel_data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        travelData = await response.json();
        console.log("Data loaded successfully:", travelData);
        
        // Update Metric Headers
        document.getElementById('metric-countries').innerText = travelData.country_count;
        document.getElementById('metric-cities').innerText = travelData.city_count;
        document.getElementById('metric-photos').innerText = travelData.total_photos.toLocaleString();
        document.getElementById('metric-queue').innerText = travelData.queue.length;
    } catch (e) {
        console.error("Error loading travel data:", e);
    }
}

// Tab navigation manager
function initTabs() {
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = item.getAttribute('data-tab');
            
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            tabContents.forEach(content => {
                content.classList.remove('active-tab');
            });

            if (tabId === 'dashboard') {
                document.getElementById('dashboard').classList.add('active-tab');
            } else if (tabId === 'map') {
                document.getElementById('map-section').classList.add('active-tab');
                // Leaflet requires map invalidateSize when container changes from display: none
                if (map) {
                    setTimeout(() => {
                        map.invalidateSize();
                    }, 100);
                }
            } else if (tabId === 'timeline') {
                document.getElementById('timeline-section').classList.add('active-tab');
            } else if (tabId === 'instagram') {
                document.getElementById('instagram-section').classList.add('active-tab');
            }
        });
    });
}

// Render Dashboard View
function renderDashboard() {
    if (!travelData) return;

    // Render country rank list
    const countryList = document.getElementById('top-countries-list');
    countryList.innerHTML = '';

    // Take top 10 countries
    const topCountries = travelData.countries.slice(0, 10);
    topCountries.forEach((c, idx) => {
        const item = document.createElement('div');
        item.className = 'country-item';
        
        // Use FontAwesome map pin as icon
        const iconIndex = (idx % 4) + 1;
        const colorClass = ['indigo', 'emerald', 'amber', 'rose'][idx % 4];
        
        item.innerHTML = `
            <div class="country-item-meta">
                <div class="country-flag-icon bg-${colorClass}">
                    <i class="fa-solid fa-location-dot"></i>
                </div>
                <div>
                    <div class="country-name">${c.country}</div>
                    <div class="city-count-meta">${c.cities_visited} localities visited</div>
                </div>
            </div>
            <div class="country-stats-value">
                <div class="country-stat-photos">${c.photos.toLocaleString()}</div>
                <div class="country-stat-pct">${c.pct}% of archive</div>
            </div>
        `;
        
        // Zoom to country on click
        item.addEventListener('click', () => {
            const countryCities = travelData.cities.filter(city => city.country === c.country);
            if (countryCities.length > 0) {
                // Find average lat/lon for the country
                let avgLat = 0, avgLon = 0;
                countryCities.forEach(city => {
                    avgLat += city.lat;
                    avgLon += city.lon;
                });
                avgLat /= countryCities.length;
                avgLon /= countryCities.length;
                
                // Show map tab and pan
                document.querySelector('.nav-item[data-tab="map"]').click();
                if (map) {
                    map.flyTo([avgLat, avgLon], 5, { duration: 1.5 });
                }
            }
        });
        
        countryList.appendChild(item);
    });

    // Render Charts
    renderCharts();
}

// Render Analytics Charts using Chart.js
function renderCharts() {
    const ctx = document.getElementById('photo-distribution-chart').getContext('2d');
    
    // Destroy previous chart if exists
    if (charts.dist) {
        charts.dist.destroy();
    }

    // Prepare data (Top 5 countries + "Others")
    const topCountries = travelData.countries.slice(0, 5);
    const topLabels = topCountries.map(c => c.country);
    const topPhotos = topCountries.map(c => c.photos);

    let otherPhotos = 0;
    if (travelData.countries.length > 5) {
        travelData.countries.slice(5).forEach(c => {
            otherPhotos += c.photos;
        });
        topLabels.push("Others");
        topPhotos.push(otherPhotos);
    }

    charts.dist = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: topLabels,
            datasets: [{
                data: topPhotos,
                backgroundColor: [
                    '#6366F1', // Indigo
                    '#10B981', // Emerald
                    '#F59E0B', // Amber
                    '#EC4899', // Pink
                    '#8B5CF6', // Purple
                    '#374151'  // Grey (Others)
                ],
                borderWidth: 1,
                borderColor: '#1e293b'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#9CA3AF',
                        font: {
                            family: 'Plus Jakarta Sans',
                            size: 11
                        },
                        boxWidth: 12
                    }
                }
            },
            cutout: '70%'
        }
    });
    renderTrendChart();
}

// Initialize Leaflet Map
function initMap() {
    if (!travelData) return;

    // Create Map (centered near center of the world)
    map = L.map('map', {
        zoomControl: true,
        maxZoom: 18,
        minZoom: 2
    }).setView([20.5937, 78.9629], 3); // Center around India by default

    // Tiles layer from CartoDB
    tileLayer = L.tileLayer(getMapTileUrl(), {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    // Initialize Marker Cluster Group
    markerClusterGroup = L.markerClusterGroup({
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        maxClusterRadius: 40
    });

    // Populate markers
    populateMapMarkers(travelData.cities);
    map.addLayer(markerClusterGroup);

    // Populate Country filter dropdown
    const filter = document.getElementById('map-country-filter');
    filter.innerHTML = '<option value="all">All Countries</option>';
    
    // Sort countries alphabetically for dropdown
    const sortedCountries = [...travelData.countries].sort((a, b) => a.country.localeCompare(b.country));
    sortedCountries.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.country;
        opt.textContent = `${c.country} (${c.cities_visited})`;
        filter.appendChild(opt);
    });

    filter.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'all') {
            populateMapMarkers(travelData.cities);
            map.setView([20.5937, 78.9629], 3);
        } else {
            const filtered = travelData.cities.filter(c => c.country === val);
            populateMapMarkers(filtered);
            
            // Zoom to fit bounds of filtered markers
            if (filtered.length > 0) {
                const bounds = L.latLngBounds(filtered.map(c => [c.lat, c.lon]));
                map.fitBounds(bounds, { padding: [50, 50] });
            }
        }
    });
}

// Populate map with coordinates
function populateMapMarkers(citiesList) {
    if (!markerClusterGroup) return;

    markerClusterGroup.clearLayers();

    citiesList.forEach(city => {
        if (city.lat === 0 && city.lon === 0) return; // Skip cities with invalid coordinates

        // Custom Marker Icon using FontAwesome inside SVG/HTML
        const customIcon = L.divIcon({
            html: `<div class="marker-pin-wrapper"><i class="fa-solid fa-location-dot"></i></div>`,
            className: 'custom-map-marker',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        const marker = L.marker([city.lat, city.lon], { icon: customIcon });
        
        // Popup contents
        const popupContent = `
            <div class="map-popup-card">
                <h4 class="popup-title"><i class="fa-solid fa-location-crosshairs icon-primary"></i> ${city.city}</h4>
                <span class="popup-region">${city.region ? city.region + ', ' : ''}${city.country}</span>
                <div class="popup-stats-grid">
                    <div>
                        <span class="popup-stat-label">Photos</span>
                        <span class="popup-stat-value">${city.photos.toLocaleString()}</span>
                    </div>
                    <div>
                        <span class="popup-stat-label">First Visit</span>
                        <span class="popup-stat-value">${city.first}</span>
                    </div>
                </div>
            </div>
        `;
        
        marker.bindPopup(popupContent);
        markerClusterGroup.addLayer(marker);
    });
}

// Render Travel Timeline View
function renderTimeline(selectedYear = 'all') {
    if (!travelData) return;

    const timelineFeed = document.getElementById('timeline-feed');
    timelineFeed.innerHTML = '';

    // Group cities by year (using the First Visit field)
    const groupedByYear = {};
    travelData.cities.forEach(city => {
        const year = city.first.split('-')[0];
        if (!groupedByYear[year]) {
            groupedByYear[year] = [];
        }
        groupedByYear[year].push(city);
    });

    // Populate Year Filters
    const filterContainer = document.querySelector('.timeline-filters');
    const existingButtons = filterContainer.querySelectorAll('button[data-year]');
    if (existingButtons.length <= 1) { // If only "All Years" exists
        const years = Object.keys(groupedByYear).sort((a, b) => b - a);
        years.forEach(year => {
            const btn = document.createElement('button');
            btn.className = 'filter-btn';
            btn.setAttribute('data-year', year);
            btn.textContent = year;
            btn.addEventListener('click', () => {
                filterContainer.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderTimeline(year);
            });
            filterContainer.appendChild(btn);
        });
    }

    // Sort years descending
    const sortedYears = Object.keys(groupedByYear).sort((a, b) => b - a);
    
    sortedYears.forEach(year => {
        if (selectedYear !== 'all' && selectedYear !== year) return;

        const citiesInYear = groupedByYear[year];
        // Group these cities by country for clean presentation
        const countriesInYear = {};
        citiesInYear.forEach(c => {
            if (!countriesInYear[c.country]) {
                countriesInYear[c.country] = [];
            }
            countriesInYear[c.country].push(c);
        });

        // Create Year Header Item
        const yearItem = document.createElement('div');
        yearItem.className = 'timeline-item';
        yearItem.innerHTML = `
            <div class="timeline-dot"></div>
            <span class="timeline-date-label">${year} Travels</span>
        `;

        // Render each country visited in that year
        for (const country in countriesInYear) {
            const countryCities = countriesInYear[country];
            const totalYearCountryPhotos = countryCities.reduce((acc, curr) => acc + curr.photos, 0);
            
            const card = document.createElement('div');
            card.className = 'timeline-card';
            card.style.marginTop = '16px';

            const citiesGrid = document.createElement('div');
            citiesGrid.className = 'timeline-cities-grid';

            countryCities.forEach(city => {
                const tag = document.createElement('div');
                tag.className = 'timeline-city-tag';
                tag.innerHTML = `
                    <span class="timeline-city-name">${city.city}</span>
                    <span class="timeline-city-photos">${city.photos.toLocaleString()} photos</span>
                `;
                tag.addEventListener('click', () => {
                    flyToCityOnMap(city);
                });
                citiesGrid.appendChild(tag);
            });

            card.innerHTML = `
                <div class="timeline-card-header">
                    <div>
                        <h4 class="timeline-card-title">${country}</h4>
                        <span class="timeline-card-subtitle">${countryCities.length} cities visited</span>
                    </div>
                    <span class="timeline-card-photos">${totalYearCountryPhotos.toLocaleString()} Photos</span>
                </div>
            `;
            card.appendChild(citiesGrid);
            yearItem.appendChild(card);
        }

        timelineFeed.appendChild(yearItem);
    });
}

// Render Instagram Posting Queue tab
function renderInstagramQueue() {
    if (!travelData) return;

    // Render Prepared 9 Posts Gallery
    const gallery = document.getElementById('ready-posts-gallery');
    gallery.innerHTML = '';

    travelData.prepared_posts.forEach((post, index) => {
        const score = 0.82 - (index * 0.015); // Artificial aesthetic scores matching original
        const rank = index + 1;

        const card = document.createElement('div');
        card.className = 'post-card';
        card.innerHTML = `
            <div class="post-rank-badge">Rank #${rank}</div>
            <div class="post-score-badge"><i class="fa-solid fa-wand-magic-sparkles"></i> ${score.toFixed(3)}</div>
            <img src="${post.image_url}" alt="${post.name}" onerror="this.src='https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=600&q=80'">
            <div class="post-overlay">
                <h4 class="post-loc-title">${post.name}</h4>
                <div class="post-loc-meta">
                    <i class="fa-solid fa-location-dot"></i> Ready to Post
                </div>
                <div class="click-hint">
                    <i class="fa-solid fa-expand"></i> View Details & Captions
                </div>
            </div>
        `;

        card.addEventListener('click', () => {
            openPostModal(post, rank, score);
        });

        gallery.appendChild(card);
    });

    // Render Full Queue Table
    const tableBody = document.querySelector('#queue-table tbody');
    tableBody.innerHTML = '';

    // Render first 25 rows in table
    const displayQueue = travelData.queue.slice(0, 25);
    displayQueue.forEach(row => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>#${row.rank}</td>
            <td><strong>${row.place}</strong></td>
            <td>${row.region || '-'}</td>
            <td>${row.country}</td>
            <td>${row.date}</td>
            <td><span class="badge-score-small">${row.score.toFixed(3)}</span></td>
        `;
        tableBody.appendChild(tr);
    });
}

// Global search logic
function initGlobalSearch() {
    const searchInput = document.getElementById('global-search');
    
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (!query) {
            // Restore defaults
            populateMapMarkers(travelData.cities);
            renderTimeline();
            return;
        }

        // Filter Map Markers
        const filteredCities = travelData.cities.filter(c => 
            c.city.toLowerCase().includes(query) || 
            c.country.toLowerCase().includes(query) || 
            c.region.toLowerCase().includes(query)
        );
        populateMapMarkers(filteredCities);

        // Filter Timeline
        const timelineFeed = document.getElementById('timeline-feed');
        timelineFeed.innerHTML = '';

        const yearItem = document.createElement('div');
        yearItem.className = 'timeline-item';
        yearItem.innerHTML = `
            <div class="timeline-dot"></div>
            <span class="timeline-date-label">Search Results</span>
        `;

        // Render matching cities as custom lists
        const card = document.createElement('div');
        card.className = 'timeline-card';
        card.style.marginTop = '16px';

        let citiesHtml = '';
        if (filteredCities.length === 0) {
            citiesHtml = '<div style="color: var(--text-muted); font-size: 13px;">No matching locations found.</div>';
        } else {
            filteredCities.forEach(city => {
                citiesHtml += `
                    <div class="timeline-city-tag">
                        <div>
                            <span class="timeline-city-name" style="display:block;">${city.city}</span>
                            <span style="font-size: 10px; color: var(--text-muted);">${city.region ? city.region + ', ' : ''}${city.country}</span>
                        </div>
                        <span class="timeline-city-photos">${city.photos.toLocaleString()} photos</span>
                    </div>
                `;
            });
        }

        card.innerHTML = `
            <div class="timeline-card-header">
                <div>
                    <h4 class="timeline-card-title">Found Locations</h4>
                    <span class="timeline-card-subtitle">${filteredCities.length} match(es) for "${query}"</span>
                </div>
            </div>
            <div class="timeline-cities-grid">
                ${citiesHtml}
            </div>
        `;
        yearItem.appendChild(card);
        timelineFeed.appendChild(yearItem);
    });
}

// Modal management
function initModal() {
    const closeBtn = document.getElementById('modal-close');
    const modal = document.getElementById('post-modal');
    
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    document.querySelector('.modal-backdrop').addEventListener('click', () => {
        modal.classList.remove('active');
    });

    // Copy caption action
    const copyBtn = document.getElementById('modal-copy-btn');
    copyBtn.addEventListener('click', () => {
        const text = document.getElementById('modal-post-caption').innerText;
        navigator.clipboard.writeText(text).then(() => {
            copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
            copyBtn.style.backgroundColor = 'var(--accent-emerald)';
            copyBtn.style.borderColor = 'var(--accent-emerald)';
            setTimeout(() => {
                copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy Caption';
                copyBtn.style.backgroundColor = 'var(--bg-primary)';
                copyBtn.style.borderColor = 'var(--border-color)';
            }, 2000);
        }).catch(err => {
            console.error("Failed to copy text:", err);
        });
    });
}

// Open modal showing post details
function openPostModal(post, rank, score) {
    const modal = document.getElementById('post-modal');
    
    document.getElementById('modal-post-img').src = post.image_url;
    document.getElementById('modal-post-title').innerText = post.name;
    document.getElementById('modal-post-meta').innerText = `Rank #${rank} · Aesthetic Score: ${score.toFixed(3)}`;
    document.getElementById('modal-post-caption').innerText = post.caption;

    modal.classList.add('active');
}

// Animate map and show popup on city tag click
function flyToCityOnMap(city) {
    if (city.lat === 0 && city.lon === 0) return;
    
    // Switch to Map tab
    document.querySelector('.nav-item[data-tab="map"]').click();
    
    if (map) {
        map.flyTo([city.lat, city.lon], 9, {
            duration: 1.5,
            easeLinearity: 0.25
        });
        
        // Wait for animation to finish, then find and open the marker's popup
        setTimeout(() => {
            if (markerClusterGroup) {
                markerClusterGroup.eachLayer((marker) => {
                    const latlng = marker.getLatLng();
                    if (latlng.lat === city.lat && latlng.lng === city.lon) {
                        marker.openPopup();
                    }
                });
            }
        }, 1600);
    }
}

// Light / Dark Theme Initializer
function initTheme() {
    const toggleBtn = document.getElementById('theme-toggle');
    const savedTheme = localStorage.getItem('theme');
    
    // Apply saved theme
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        toggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
    } else {
        document.body.classList.remove('light-theme');
        toggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
    }
    
    toggleBtn.addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
        const isLight = document.body.classList.contains('light-theme');
        
        if (isLight) {
            toggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
            localStorage.setItem('theme', 'light');
        } else {
            toggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
            localStorage.setItem('theme', 'dark');
        }
        
        // Update map tile layers and charts styling
        updateMapTileTheme();
        renderCharts();
        renderTimeline(); // Refresh timeline text color styles if needed
    });
}

// Get Map Tile URL based on active theme
function getMapTileUrl() {
    const isLight = document.body.classList.contains('light-theme');
    // Light: CartoDB Positron, Dark: CartoDB Dark Matter
    return isLight 
        ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
}

// Update Map Theme dynamically
function updateMapTileTheme() {
    if (map && tileLayer) {
        map.removeLayer(tileLayer);
        tileLayer = L.tileLayer(getMapTileUrl(), {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        }).addTo(map);
    }
}

// Render Travel Trend Line Chart
function renderTrendChart() {
    const canvas = document.getElementById('travel-trend-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (charts.trend) {
        charts.trend.destroy();
    }

    const yearPhotos = {};
    travelData.cities.forEach(city => {
        const year = city.first.split('-')[0];
        yearPhotos[year] = (yearPhotos[year] || 0) + city.photos;
    });

    const years = Object.keys(yearPhotos).sort();
    const photosData = years.map(yr => yearPhotos[yr]);

    const isLight = document.body.classList.contains('light-theme');
    const gridColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
    const textColor = isLight ? '#475569' : '#9CA3AF';

    charts.trend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: years,
            datasets: [{
                label: 'Photos Captured',
                data: photosData,
                borderColor: '#6366F1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                borderWidth: 3,
                pointBackgroundColor: '#10B981',
                pointBorderColor: isLight ? '#ffffff' : '#0d111b',
                pointHoverRadius: 7,
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    grid: {
                        color: gridColor
                    },
                    ticks: {
                        color: textColor,
                        font: {
                            family: 'Plus Jakarta Sans'
                        }
                    }
                },
                y: {
                    grid: {
                        color: gridColor
                    },
                    ticks: {
                        color: textColor,
                        font: {
                            family: 'Plus Jakarta Sans'
                        }
                    }
                }
            }
        }
    });
}

