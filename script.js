// Service Worker Registration
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw_online_first.js")
}

let iconMap = {}
let storeTypes = []
let parkingSpots = []

document.addEventListener("DOMContentLoaded", () => {
    fetch("header.html")
        .then(res => res.text())
        .then(data => {
            document.getElementById("ck_headerContainer").innerHTML = data

            // Menu toggle listeners
            const menuToggle = document.querySelector('.ck_menuToggle')
            const navLinks = document.querySelector('.ck_navLinks')

            if (menuToggle && navLinks) {
                menuToggle.addEventListener('click', () => {
                    navLinks.classList.toggle('ck_showSideBar')
                })

                document.querySelectorAll('.ck_navLinks a').forEach(link => {
                    link.addEventListener('click', () => {
                        navLinks.classList.remove('ck_showSideBar')
                    })
                })

                setupNavigation()
            }
        })

    fetch("footer.html")
        .then(res => res.text())
        .then(data => {
            document.getElementById("ck_footerContainer").innerHTML = data
        })

    // Fetch and load the JSON configuration at startup
    fetch('placeTypes.json')
        .then(response => response.json())
        .then(data => {
            iconMap = data.iconMappings
            storeTypes = data.storeTypes
            parkingSpots = data.parkingSpots

            // Initialize map after we have our config
            if (typeof google !== 'undefined' && google.maps) {
                initMap()
            }
            setupSearch()
            if (document.getElementById("ck_thingsToDoContainer")) {
                loadPlaces()
            }
        })
        .catch(error => {
            console.error('Error loading icon configuration:', error)
            // Use default icon if JSON fails to load
            iconMap = {
                'default': 'images/markers/default.png'
            }
            if (window.initMap) window.initMap()
        })

    // Currency converter api
    const currencyApi = `https://api.frankfurter.app/currencies`
    fetch(currencyApi)
        .then(response => response.json())
        .then(data => {
            const currencies = Object.keys(data).filter(key => key !== 'GBP')
            let htmlString = `<select id="currencyList" onchange="updateCurrency(this.value)">
                                        <option value="EUR" selected>EUR</option>`
            currencies.forEach(currency => {
                if (currency !== 'EUR') {
                    htmlString += `<option value="${currency}">${currency}</option>`
                }
            })
            htmlString += `</select>`
            document.getElementById('currencySelector').innerHTML = htmlString
            performConversion() // Initial conversion with default values
        })
        .catch(error => {
            console.error('Error fetching currencies:', error)
            document.getElementById('currencySelector').innerHTML = '<p style="color: red;">Failed to load currencies</p>'
        })


    const lat = 51.4183
    const lon = -0.2206
    const weatherApi = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min&current_weather=true&forecast_days=14&timezone=auto`
    fetch(weatherApi)
        .then(response => response.json())
        .then(data => {
            // Today's Weather
            const today = data.current_weather
            document.getElementById('ck_todayTemp').textContent = `${today.temperature}°C`
            document.getElementById('ck_todayDesc').textContent = getWeatherDescription(today.weathercode)
            document.getElementById('ck_todayEmoji').textContent = getWeatherEmoji(today.weathercode)

            // 10-Day Forecast
            const forecastHTML = data.daily.time.slice(0, 10).map((date, index) => {
                const dayName = new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })

                return `<div class="ck_weatherCard">
                          <h3>${dayName}</h3>
                          <div class="ck_cardEmoji">${getWeatherEmoji(data.daily.weathercode[index])}</div>
                          <div class="ck_tempRange">
                            <span class="ck_maxTemp">↑${data.daily.temperature_2m_max[index]}°C</span>
                            <span class="ck_minTemp">↓${data.daily.temperature_2m_min[index]}°C</span>
                          </div>
                        </div>`
            }).join('')

            document.getElementById('ck_weatherForecast').innerHTML = forecastHTML
        })
        .catch(error => {
            console.error('Error fetching weather:', error)
            document.getElementById('ck_todayDesc').textContent = "Weather unavailable"
        })


})

// Convert Open-Meteo weather codes to emoji
function getWeatherEmoji(weathercode) {
    // Weather codes: https://open-meteo.com/en/docs
    const emojis = {
        0: '☀️',  // Sunny
        1: '🌤️',  // Mainly clear
        2: '⛅️',  // Partly cloudy
        3: '☁️',  // Cloudy
        45: '🌫️', // Fog
        51: '🌦️', // Light drizzle
        61: '🌧️', // Rain
        80: '🌧️', // Heavy Rain
        95: '⛈️',  // Thunderstorm
    }
    return emojis[weathercode] || '❓'
}

// Convert weather codes to descriptions
function getWeatherDescription(weathercode) {
    const descriptions = {
        0: "Sunny",
        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Cloudy",
        45: "Fog",
        51: "Light drizzle",
        61: "Rain",
        80: "Heavy Rain",
        95: "Thunderstorm",
    }
    return descriptions[weathercode] || "Unknown weather"
}

// Global variable to track the current active page
let currentActivePage = ''

// Setup and update the active page based on window.location.pathname
function setupNavigation() {
    const navLinks = document.querySelectorAll('.ck_navLinks a')
    // /folder/index.html becomes ["", "folder", "index.html"], then .pop returns last element which is the page we want
    // get the current page user is in
    const currentPath = window.location.pathname.split('/').pop() || 'index.html'

    // Set the global active page
    currentActivePage = currentPath

    navLinks.forEach(link => {
        // Remove active class from all links
        link.classList.remove('ck_activePage')

        // Get the link's href and extract filename
        const linkPath = link.getAttribute('href').split('/').pop()

        // Check if this link matches current page
        if (linkPath === currentPath) {
            link.classList.add('ck_activePage')
        }

        // Add click handler to update active page
        link.addEventListener('click', function() {
            // Remove active class from all links
            navLinks.forEach(navLink => navLink.classList.remove('ck_activePage'))
            // Add active class to clicked link
            this.classList.add('ck_activePage')

            // Update the global active page
            currentActivePage = this.getAttribute('href').split('/').pop()
        })
    })
}

let service
let ck_map
let ck_routePlannerMap
let allMarkers = ['restaurant', 'lodging', 'store', 'tourist_attraction', 'cafe', 'parking']
let currentMarkers = []
let routePlannerMarkers = []
let directionsService
let directionsRenderer
let submitBefore = false

// Load maps based on which page the user is in
window.initMap = function () {
    // Home page map
    const mainMapElement = document.getElementById("ck_map")
    if (mainMapElement) {
        initializeMainMap()
        addParkingSpotsToMap(ck_map, currentMarkers)
    }

    // Route planner map
    const routePlannerMapElement = document.getElementById("ck_routePlannerMap")
    if (routePlannerMapElement) {
        initializeRoutePlannerMap()
        addParkingSpotsToMap(ck_routePlannerMap, routePlannerMarkers)
    }
}

// Initialize main map
function initializeMainMap() {
    let services_centre_location = { lat: 51.4183, lng: -0.2206 }

    ck_map = new google.maps.Map(document.getElementById("ck_map"), {
        mapId: "MAIN_MAP_ID",
        zoom: 15,
        center: new google.maps.LatLng(services_centre_location),
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        mapTypeControlOptions: {
            mapTypeIds: ["roadmap", "hide_poi"]
        }
    })

    hidePointsOfInterest(ck_map)

    service = new google.maps.places.PlacesService(ck_map)

    // Load all markers initially
    updateMapWithFilters(['all'])

    // Set up map filter buttons
    setupFilterButtons()
}

// Initialize route planner map
function initializeRoutePlannerMap() {
    let services_centre_location = { lat: 51.4183, lng: -0.2206 }
    clearDirections()
    submitBefore = false

    if (directionsRenderer) {
        directionsRenderer.setMap(null)
    }

    // Autocomplete text for places
    if (document.getElementById("ck_start")) {
        new google.maps.places.Autocomplete(document.getElementById("ck_start"))
    }
    if (document.getElementById("ck_end")) {
        new google.maps.places.Autocomplete(document.getElementById("ck_end"))
    }

    ck_routePlannerMap = new google.maps.Map(document.getElementById("ck_routePlannerMap"), {
        mapId: "ROUTE_MAP_ID",
        zoom: 15,
        center: new google.maps.LatLng(services_centre_location),
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        mapTypeControlOptions: {
            mapTypeIds: ["roadmap", "hide_poi"]
        }
    })

    let submitBtn = document.getElementById("ck_submit")
    submitBtn.addEventListener("click", () => {
        calculateRoute()
    })

    hidePointsOfInterest(ck_routePlannerMap)

    // Set up directions renderer for route planning
    directionsRenderer = new google.maps.DirectionsRenderer()
    directionsRenderer.setMap(ck_routePlannerMap)

    // Load all markers initially
    loadRoutePlannerMarkers(services_centre_location)

    // Set up waypoint functionality
    setupWaypointHandlers()
}

function addParkingSpotsToMap(map, markersArray) {
    parkingSpots.forEach(spot => {
        const place = {
            name: spot.name,
            place_id: 'custom_' + Math.random().toString(36).substr(2, 9), // custom random id e.g. custom_4f9d2x7ba
            types: ['parking'],
            geometry: {
                location: new google.maps.LatLng(spot.lat || 51.4183, spot.lng || -0.2206)
            },
            formatted_address: spot.formatted_address,
            international_phone_number: spot.international_phone_number,
            photos: spot.photos ? spot.photos.map(p => ({
                getUrl: () => p.photo_reference
            })) : null
        }
        createMarker(place, map, markersArray)
    })
}

function clearRoute() {
    // Clear start & end input
    document.getElementById("ck_start").value = ''
    document.getElementById("ck_end").value = ''
    const waypointInputs = document.querySelectorAll(".stop")
    // Remove all the stops
    waypointInputs.forEach(input => { input.remove() })

    // Clear existing directions renderer
    if (directionsRenderer) {
        directionsRenderer.setMap(null)
        directionsRenderer = null
    }

    // Hide clear route button
    document.getElementById("ck_clearRoute").style.display = "none"

    // Re-initialize the map
    initializeRoutePlannerMap()
}

// Load markers for the route planner map
function loadRoutePlannerMarkers(location) {
    const routePlannerService = new google.maps.places.PlacesService(ck_routePlannerMap)

    allMarkers.forEach(type => {
        routePlannerService.nearbySearch({
            location: location,
            radius: 1000,
            type: type
        }, (results, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK) {
                results.forEach(result => { createMarker(result, ck_routePlannerMap, routePlannerMarkers, true)})
            }
        })
    })
}

// Create marker
function createMarker(place, map, markersArray, isRoutePlanner = false) {
    // Check if this is a custom parking spot
    const isCustomParking = place.place_id && place.place_id.toString().startsWith('custom_')

    // Skip Google parking spots (only allow custom ones)
    if (!isCustomParking && place.types && place.types.includes('parking')) {
        return
    }

    const icon = document.createElement("img")
    const primaryType = place.types ? place.types[0] : 'default'
    const isRestaurantOrCafe = place.types?.includes('restaurant') || place.types?.includes('cafe')
    const isStoreType = !isRestaurantOrCafe && place.types?.some(t => storeTypes.includes(t))

    const iconKey = isCustomParking ? 'parking' : (isStoreType ? 'store' : (iconMap[primaryType] ? primaryType : 'default'))

    icon.src = iconMap[iconKey] || iconMap.default
    icon.style.width = iconKey === 'default' ? "30px" : "38px"

    const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        content: icon,
        position: place.geometry.location
    })

    markersArray.push(marker)
    const infoWindow = new google.maps.InfoWindow()

    google.maps.event.addListener(marker, "click", () => {
        // For custom parking spots, data already available from json file
        if (isCustomParking) {
            const photo = place.photos?.[0]?.getUrl() || 'images/placeholder.png'
            const content = `<div class="ck_infoWindowContent">
                            <img src="${photo}" alt="${place.name}" width="80" height="80">
                            <h3>${place.name}</h3>
                            <p>
                                ${place.formatted_address}<br>
                                <i>${place.international_phone_number || ''}</i>
                            </p>
                            ${isRoutePlanner ? `<button id="ck_addAsWaypointBtn" class="ck_infoBtn">Add as waypoint</button>` : ''}
                        </div>`
            infoWindow.setContent(content)
            infoWindow.open(map, marker)

            // Save reference to current place for the waypoint button
            if (isRoutePlanner) {
                setTimeout(() => {
                    const btn = document.getElementById("ck_addAsWaypointBtn")
                    if (btn) {
                        btn.addEventListener("click", () => {
                            addWaypointFromMarker(place)
                            infoWindow.close()
                        })
                    }
                }, 100)
            }
        } else {
            // For Google Places, fetch data from google api
            const request = {
                placeId: place.place_id,
                fields: ["name", "formatted_address", "international_phone_number", "icon", "geometry", "photos", "place_id"],
            }

            const service = new google.maps.places.PlacesService(map)
            service.getDetails(request, (placeDetails) => {
                const photo = placeDetails.photos?.[0]?.getUrl({width: 80}) || 'images/placeholder.png'
                let content = `<div class="ck_infoWindowContent">
                            <img src="${photo}" alt="${placeDetails.name}" width="80" height="80">
                            <h3>${placeDetails.name}</h3>
                            <p>
                                ${placeDetails.formatted_address}<br>
                                <i>${placeDetails.international_phone_number || ''}</i>
                            </p>
                            ${isRoutePlanner ? `<button id="ck_addAsWaypointBtn" class="ck_infoBtn">Add as waypoint</button>` : ''}
                        </div>`

                infoWindow.setContent(content)
                infoWindow.open(map, marker)

                // Add waypoint handler with the correct place details
                if (isRoutePlanner) {
                    setTimeout(() => {
                        const btn = document.getElementById("ck_addAsWaypointBtn")
                        if (btn) {
                            btn.addEventListener("click", () => {
                                addWaypointFromMarker(placeDetails)
                                infoWindow.close()
                            })
                        }
                    }, 100)
                }
            })
        }
    })
}

// Add a waypoint from a marker
function addWaypointFromMarker(placeDetails) {
    const waypointInput = document.createElement("input")
    waypointInput.type = "text"
    waypointInput.value = placeDetails.name
    waypointInput.className = "ck_waypointInput"
    waypointInput.setAttribute("data-place-id", placeDetails.place_id)

    addWaypoint(waypointInput)
}

// Setup waypoint handlers
function setupWaypointHandlers() {
    const addWaypointBtn = document.getElementById("ck_addWaypoint")
    if (addWaypointBtn) {
        addWaypointBtn.addEventListener("click", () => {
            const waypointInput = document.createElement("input")
            waypointInput.type = "text"
            waypointInput.className = "ck_waypointInput"

            addWaypoint(waypointInput)

            // Add autocomplete to the new input field
            new google.maps.places.Autocomplete(waypointInput)
        })
    }
}

// Add a waypoint to the route
function addWaypoint(waypointInput) {
    const startInput = document.getElementById("ck_start")
    const endInput = document.getElementById("ck_end")

    if (waypointInput.value !== "") {
        if (startInput.value === "") {
            startInput.value = waypointInput.value
            return
        } else if (endInput.value === "") {
            endInput.value = waypointInput.value
            return
        }
    }

    const waypointsContainer = document.getElementById("ck_waypointsContainer")

    if (!waypointsContainer) return

    const waypointRow = document.createElement("div")
    waypointRow.classList.add("ck_waypointRow", "stop")

    const label = document.createElement("span")
    label.className = "ck_selectLocationLabel"
    label.textContent = "Stop:"

    const removeBtn = document.createElement("button")
    removeBtn.className = "ck_removeWaypoint"
    removeBtn.innerHTML = '<i class="fas fa-times"></i>'

    removeBtn.addEventListener("click", () => {
        waypointsContainer.removeChild(waypointRow)
        if (submitBefore) calculateRoute() // Recalculate route after removing waypoint if submitted b4
    })

    // Nest all these inside the waypointRow div
    waypointRow.appendChild(label)
    waypointRow.appendChild(waypointInput)
    waypointRow.appendChild(removeBtn)
    // Nest waypointRow inside the waypointsContainer
    waypointsContainer.appendChild(waypointRow)
}

function handleTransportModeChange() {
    const transportButtons = document.querySelectorAll('.ck_transportBtn')

    transportButtons.forEach(button => {
        button.addEventListener('click', () => {
            transportButtons.forEach(button => {
                // Remove the previous active transport mode
                if (button.classList.contains('ck_activeTransportMode')) {
                    button.classList.remove('ck_activeTransportMode')
                }
            })
            // Assign the active transport mode to the clicked button
            button.classList.toggle('ck_activeTransportMode')
            calculateRoute(button.id)
        })
    })
}

function clearDirections() {
    // Clear any existing directions
    document.getElementById("ck_directions").innerHTML = ""
    document.getElementById("ck_directionsPanel").style.display = "none"
    document.getElementById("ck_transportMode").style.display = "none"
}

// Calculate route with stops
function calculateRoute(mode = "DRIVING") {
    const start = document.getElementById("ck_start")?.value
    const end = document.getElementById("ck_end")?.value

    if (!start || !end) {
        showErrorModal("Please enter both a start and end location to proceed.")
        clearDirections()
        return
    }

    if (!directionsService) {
        directionsService = new google.maps.DirectionsService()
    }

    // Clear existing directions properly
    const directionsPanel = document.getElementById("ck_directions")
    directionsPanel.innerHTML = ""

    // Get all waypoints
    const waypointInputs = document.querySelectorAll(".ck_waypointInput")
    const waypoints = Array.from(waypointInputs).map(input => {
        return {
            location: input.value,
            stopover: true
        }
    })

    const request = {
        origin: start,
        destination: end,
        waypoints: waypoints,
        optimizeWaypoints: false,
        travelMode: mode
    }

    directionsService.route(request, (route, status) => {
        if (status === google.maps.DirectionsStatus.OK) {
            // Clear the previous renderer
            if (directionsRenderer) {
                directionsRenderer.setMap(null)
                directionsRenderer.setPanel(null)
            }

            // Create a new renderer each time
            directionsRenderer = new google.maps.DirectionsRenderer()
            directionsRenderer.setMap(ck_routePlannerMap)
            directionsRenderer.setPanel(directionsPanel)
            directionsRenderer.setDirections(route)

            // Hide all markers when showing route
            toggleMarkersVisibility(routePlannerMarkers, false)
            document.getElementById("ck_directionsPanel").style.display = "flex"
            document.getElementById("ck_clearRoute").style.display = "block"
            document.getElementById("ck_transportMode").style.display = "block"
            document.getElementById("ck_transportMode").innerHTML = `<h4>${mode}</h4>`
            submitBefore = true

            // Scroll to the map
            setTimeout(() => {
                document.getElementById("ck_routePlannerMap").scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                })
            }, 300) // Short delay to allow for directions to render
        } else {
            showErrorModal("Services not available for this route. Please try again.")
            clearDirections()
        }
    })
}

// Toggle visibility of route planner markers
function toggleMarkersVisibility(markers, show) {
    markers.forEach(marker => {
        marker.map = show ? ck_routePlannerMap : null
    })
}

// Hide points of interest on the map
function hidePointsOfInterest(map) {
    let styles = [
        {
            "featureType": "poi",
            "stylers": [{"visibility": "off"}]
        }
    ]

    let styledMapType = new google.maps.StyledMapType(styles, {name: "POI Hidden", alt: "Hide Points of Interest"})
    map.mapTypes.set("hide_poi", styledMapType)

    map.setMapTypeId("hide_poi")
}

// Setup filter buttons for the main map
function setupFilterButtons() {
    const filterButtons = document.querySelectorAll('.ck_filterBtn')
    const allButton = document.getElementById('all')

    if (!filterButtons.length) return

    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (button.id === 'all') {
                // When "All" is selected, deactivate others
                filterButtons.forEach(btn => btn.classList.remove('ck_activeFilter'))
                allButton.classList.add('ck_activeFilter')
            } else {
                button.classList.toggle('ck_activeFilter')
                allButton.classList.remove('ck_activeFilter')
            }

            // Get currently active filters
            const activeFilters = Array.from(filterButtons)
                .filter(btn => btn.classList.contains('ck_activeFilter'))
                .map(btn => btn.id)

            updateMapWithFilters(activeFilters)
        })
    })
}

// Update the main map with filters
function updateMapWithFilters(filters) {
    // Clear old markers
    currentMarkers.forEach(marker => marker.map = null)
    currentMarkers = []

    const location = ck_map.getCenter()

    // Add parking spots to the map if 'all' or 'parking' filter is selected
    if (filters.includes('all') || filters.includes('parking')) {
        addParkingSpotsToMap(ck_map, currentMarkers)
    }

    // If 'all' is selected or no filters, show everything
    if (filters.length === 0 || filters.includes('all')) {
        allMarkers.forEach(type => {
            if (type !== 'parking') { // Skip Google's parking search
                performNearbySearch(type, location)
            }
        })
        return
    }

    filters.forEach(type => {
        if (type !== 'parking') { // Skip Google's parking search
            performNearbySearch(type, location)
        }
    })
}

// Perform a nearby search for the main map
function performNearbySearch(type, location) {
    if (type === 'parking') return // Skip Google parking search

    service.nearbySearch({
        location: location,
        radius: 1000,
        type: type
    }, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) {
            results.forEach(result => {
                // Skip any parking results that Google might return
                if (!result.types?.includes('parking')) {
                    createMarker(result, ck_map, currentMarkers)
                }
            })
        }
    })
}

function toggleDirections() {
    const icon = document.getElementById("ck_directionsChevron")
    const isVisible = directions.style.display !== "none"

    document.getElementById("ck_transportMode").style.display = isVisible ? "none" : "block"
    document.getElementById("ck_directions").style.display = isVisible ? "none" : "block"
    icon.classList.remove(isVisible ? "fa-chevron-up" : "fa-chevron-down")
    icon.classList.add(isVisible ? "fa-chevron-down" : "fa-chevron-up")
}

function setupSearch() {
    const searchInput  = document.getElementById("ck_searchInput")
    const searchButton = document.getElementById("ck_searchButton")
    const clearBtn     = document.getElementById("ck_clearSearch")

    if (!searchInput || !searchButton || !clearBtn) return

    clearBtn.addEventListener("click", () => {
        clearSearchResults()
        searchInput.value = ""
        searchInput.focus()
    })
    searchButton.addEventListener("click", performSearch)
    searchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") performSearch()
    })

    new google.maps.places.Autocomplete(searchInput)
}

function performSearch() {
    const searchInput = document.getElementById("ck_searchInput")
    const query = searchInput.value.trim()

    if (!query) {
        showErrorModal("Please enter a search term.")
        return
    }

    if (!ck_map) return

    const service = new google.maps.places.PlacesService(ck_map)

    service.textSearch({
        query: query,
        bounds: ck_map.getBounds()
    }, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results.length > 0) {
            displaySearchResults(results)
        } else {
            showErrorModal("No results found for your search")
        }
    })
}

function clearSearchResults() {
    if (window.searchMarkers) {
        window.searchMarkers.forEach(marker => marker.setMap(null))
    }
    window.searchMarkers = []
}

function displaySearchResults(results) {
    const bounds = new google.maps.LatLngBounds()
    window.searchMarkers = []

    results.forEach(place => {
        const marker = new google.maps.Marker({
            map: ck_map,
            position: place.geometry.location,
            title: place.name
        })

        window.searchMarkers.push(marker)
        bounds.extend(place.geometry.location)

        const infoWindow = new google.maps.InfoWindow({
            content: `<div><strong>${place.name}</strong><br>${place.formatted_address || ''}</div>`
        })

        marker.addListener("click", () => {
            infoWindow.open(ck_map, marker)
        })
    })

    ck_map.fitBounds(bounds)
}

// Determine page type from URL
function getPageTypeFromUrl(url) {
    const pageMap = {
        'thingsToDo.html': 'attractions',
        'hotels.html': 'hotels',
        'restaurants.html': 'restaurants'
    }

    return pageMap[url] || 'default'
}

// Get configuration based on page type
function getContentConfig(pageType) {
    const configs = {
        'attractions': {
            containerId: "ck_thingsToDoContainer",
            types: ["tourist_attraction", "museum", "park", "art_gallery", "shopping_mall"],
            radius: 3000,
            customSpots: parkingSpots
        },
        'hotels': {
            containerId: "ck_hotelsContainer",
            types: ["lodging"],
            radius: 5000
        },
        'restaurants': {
            containerId: "ck_restaurantsContainer",
            types: ["restaurant", "cafe", "bakery", "bar"],
            radius: 3000
        }
    }

    return configs[pageType]
}

// Filter attractions
function filterAttractions() {
    const selectedType = document.getElementById("attractionTypeFilter").value
    const placeCards = document.querySelectorAll(".ck_placeCard")

    placeCards.forEach(card => {
        const cardType = card.getAttribute("placeType")

        // Show parking only when parking is selected, hide otherwise
        if (cardType === "parking") {
            card.style.display = selectedType === "parking" ? "flex" : "none"
        } else {
            card.style.display = selectedType === "all" || cardType === selectedType ? "flex" : "none"
        }
    })
}

// Generic function to load places for any page type
function loadPlaces() {
    // Determine page type from URL
    const currentPage = getPageTypeFromUrl(currentActivePage)
    const pageConfig = getContentConfig(currentPage)

    const location = { lat: 51.4183, lng: -0.2206 }
    const map = new google.maps.Map(document.createElement('div')) // hidden dummy map
    const service = new google.maps.places.PlacesService(map)
    const container = document.getElementById("ck_thingsToDoContainer")
    const addedPlaces = new Set()

    // Clear container
    container.innerHTML = ''

    // Load Google Places results
    pageConfig.types.forEach(type => {
        service.nearbySearch(
            {
                location,
                radius: pageConfig.radius || 3000,
                type: type
            },
            (results, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK) {
                    results.forEach(place => {
                        if (addedPlaces.has(place.place_id)) return
                        addedPlaces.add(place.place_id)

                        service.getDetails(
                            {
                                placeId: place.place_id,
                                fields: ["name", "formatted_address", "rating", "user_ratings_total", "photos", "website", "international_phone_number"]
                            },
                            (details, status) => {
                                if (status === google.maps.places.PlacesServiceStatus.OK) {
                                    createPlaceCard(container, details, type)
                                }
                            }
                        )
                    })
                }
            }
        )
    })

    // Add custom spots if configured
    if (pageConfig.customSpots && pageConfig.customSpots.length > 0) {
        pageConfig.customSpots.forEach(spot => {
            createPlaceCard(container, {
                name: spot.name,
                formatted_address: spot.formatted_address,
                rating: spot.rating,
                user_ratings_total: spot.user_ratings_total,
                photos: spot.photos ? [{ getUrl: () => spot.photos[0].photo_reference }] : null,
                website: spot.website,
                international_phone_number: spot.international_phone_number
            }, pageConfig.customType || 'custom', true) // hidden by default
        })
    }
}

// Helper function to create place cards
function createPlaceCard(container, placeDetails, placeType, isHidden = false) {
    const photo = placeDetails.photos?.[0]?.getUrl({ maxWidth: 400 }) || 'images/placeholder.png'
    const card = document.createElement("div")
    card.className = "ck_placeCard"
    card.setAttribute("placeType", placeType)
    if (isHidden) card.style.display = "none"

    card.innerHTML = `
        <img src="${photo}" alt="${placeDetails.name}">
        <div class="ck_placeInfo">
            <h3>${placeDetails.name}</h3>
            <p><i class="fas fa-map-marker-alt"></i> ${placeDetails.formatted_address || "Address not available"}</p>
            ${placeDetails.rating ? `<p><i class="fas fa-star"></i> ${placeDetails.rating} (${placeDetails.user_ratings_total || 0} reviews)</p>` : ''}
            ${placeDetails.international_phone_number ? `<p><i class="fa-solid fa-phone"></i> ${placeDetails.international_phone_number}</p>` : ''}
            <div class="ck_placeLinks">
                ${placeDetails.website ? `<a href="${placeDetails.website}" target="_blank" class="ck_btnSmall">Website</a>` : ''}
                ${placeDetails.international_phone_number ? `<a href="tel:${placeDetails.international_phone_number}" class="ck_btnSmall">Call</a>` : ''}
            </div>
        </div>`

    container.appendChild(card)
}

let currentCurrency = 'EUR'

function updateCurrency(currency) {
    currentCurrency = currency
    performConversion()
}

function performConversion() {
    document.getElementById('gbpValue').value = "Loading.."
    const amtToConvert = document.getElementById('currencyToConvertFromAmount').value || 0
    const url = `https://api.frankfurter.dev/v1/latest?amount=${amtToConvert}&base=${currentCurrency}&symbols=GBP`
    fetch(url)
        .then(response => response.json())
        .then(data => {
            document.getElementById('gbpValue').value = (data.rates.GBP).toFixed(2)
        })
        .catch(error => {
            console.error('Error during conversion:', error)
            document.getElementById('gbpValue').value = "Error"
        })
}

function showErrorModal(message) {
    const modal = document.getElementById('ck_errorModal')
    const messageContainer = document.getElementById('ck_modalMessage')
    const closeModalBtn = document.getElementById('ck_closeModal')
    const confirmBtn = document.getElementById('ck_modalConfirm')

    messageContainer.textContent = message
    modal.style.display = 'block'

    const close = () => modal.style.display = 'none'

    closeModalBtn.onclick = close
    confirmBtn.onclick = close

    // Close modal when user clicks outside the modal
    window.onclick = (event) => {
        if (event.target === modal) {
            close()
        }
    }
}
