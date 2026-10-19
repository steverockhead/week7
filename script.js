        // The iframe loads in the background, but its content can take longer to render.
        // Ready flag, whether the user is waiting, and the delay timer.
        let liveModelReady = false;
        let showWhenReady = false;
        let fallbackReadyTimer = null;

        window.addEventListener("DOMContentLoaded", function () {
            // The iframe load event means its page loaded, not necessarily its 3D model.
            document.getElementById("liveModel").addEventListener("load", function () {
                // As in Week 6, allow time for the 3D viewer to finish initialising.
                clearTimeout(fallbackReadyTimer);
                fallbackReadyTimer = setTimeout(markLiveModelReady, 12000);
            });
        });

        // After the delay, reveal the viewer only if it was requested.
        function markLiveModelReady() {
            if (liveModelReady) return;
            liveModelReady = true;
            clearTimeout(fallbackReadyTimer);
            if (showWhenReady) revealLiveModel();
        }

        function revealLiveModel() {
            const stage = document.getElementById("modelStage");
            const viewer = document.getElementById("liveModel");
            showWhenReady = false;
            // Keep the loading screen visible until the viewer has faded in.
            const finishFade = function (event) {
                // Ignore transitions other than the viewer opacity fade.
                if (event.propertyName !== "opacity") return;
                viewer.removeEventListener("transitionend", finishFade);
                if (viewer.classList.contains("is-visible")) stage.classList.remove("is-loading");
            };
            viewer.addEventListener("transitionend", finishFade);
            viewer.classList.add("is-visible");
            document.getElementById("modelToggle").textContent = "Return to Static Image";
        }

        // Switch to the model or return to the image, including while loading.
        function toggleLiveModel() {
            const stage = document.getElementById("modelStage");
            const image = document.getElementById("staticModel");
            const viewer = document.getElementById("liveModel");
            const button = document.getElementById("modelToggle");

            // A second click cancels loading or switches back to the static image.
            if (showWhenReady || viewer.classList.contains("is-visible")) {
                showWhenReady = false;
                viewer.classList.remove("is-visible");
                stage.classList.remove("is-loading");
                image.classList.remove("is-hidden");
                button.textContent = "Show Live 3D Model";
                return;
            }

            stage.classList.add("is-loading");
            image.classList.add("is-hidden");
            if (liveModelReady) {
                revealLiveModel();
            } else {
                showWhenReady = true;
                button.textContent = "Loading 3D Model...";
            }
        }
        // jQuery waits until the HTML is ready, then listens for Instructions clicks.
        $(function () {
            $("#instructionsToggle").on("click", function () {
                const $panel = $("#modelInstructions");
                // prop reads/changes hidden; text updates the button label.
                const opening = $panel.prop("hidden");
                $panel.prop("hidden", !opening);
                $(this).text(opening ? "Hide Instructions" : "Instructions");
            });
        });
        // Keep the selected town and discard out-of-date searches.
        // null means no town has been selected yet.
        let selectedLocation = null;
        // Timer delays searches until typing pauses.
        let locationSearchTimer = null;
        // Counter identifies the newest search.
        let locationSearchRequestId = 0;

        // Run this once the HTML has loaded.
        window.addEventListener("DOMContentLoaded", function () {
            const dateInput = document.getElementById("installationDate");
            // Date() gives the current date and time.
            const today = new Date();
            // Copy today so adding 15 days does not change the original.
            const finalForecastDay = new Date(today);
            // getDate reads the day. setDate changes it and handles month changes.
            finalForecastDay.setDate(finalForecastDay.getDate() + 15);

            // Limit the date picker to today through 15 days ahead.
            dateInput.min = formatDateForInput(today);
            dateInput.max = formatDateForInput(finalForecastDay);
            dateInput.value = formatDateForInput(today);

            // Run the weather check when the button is clicked.
            document.getElementById("checkConditions").addEventListener("click", checkInstallationConditions);

            const locationInput = document.getElementById("siteLocation");
            const suggestions = document.getElementById("locationSuggestions");
            // Wait briefly after typing before requesting matching UK towns.
            locationInput.addEventListener("input", function () {
                // Typing again clears the previous selection.
                selectedLocation = null;
                locationSearchRequestId++;
                clearTimeout(locationSearchTimer);
                suggestions.hidden = true;
                // Remove old town buttons.
                suggestions.replaceChildren();
                const query = locationInput.value.trim();
                // Wait for at least two characters.
                // Postcodes are looked up when Check conditions is clicked, not suggested.
                if (query.length < 2 || looksLikeFullPostcode(query) || looksLikeOutwardPostcode(query)) return;
                // Delay the API request by 300 milliseconds.
                locationSearchTimer = setTimeout(function () {
                    searchLocations(query);
                }, 300);
            });
            // Reopen existing choices on focus, hide them on an outside click.
            locationInput.addEventListener("focus", function () {
                if (suggestions.children.length && !selectedLocation) suggestions.hidden = false;
            });
            document.addEventListener("click", function (event) {
                if (!event.target.closest(".location-search-field")) suggestions.hidden = true;
            });
        });

        // Convert a date to the YYYY-MM-DD format required by the HTML input.
        function formatDateForInput(date) {
            const year = date.getFullYear();
            // Months start at zero in JS. padStart adds a leading zero.
            const month = String(date.getMonth() + 1).padStart(2, "0");
            const day = String(date.getDate()).padStart(2, "0");
            return year + "-" + month + "-" + day;
        }

        // Remove spaces and recognise complete UK postcodes (e.g. S70 1AA).
        function looksLikeFullPostcode(value) {
            const compact = value.replace(/\s+/g, "").toUpperCase();
            return compact === "GIR0AA" || /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(compact);
        }

        // An outward postcode is just the first part (e.g. S70 or NE1).
        function looksLikeOutwardPostcode(value) {
            const compact = value.replace(/\s+/g, "").toUpperCase();
            return /^[A-Z]{1,2}\d[A-Z\d]?$/.test(compact);
        }

        // API reference: Postcodes.io postcode and outcode endpoints — https://postcodes.io/docs
        // Postcodes.io supplies coordinates for a complete postcode.
        async function lookupFullPostcode(postcode) {
            const compact = postcode.replace(/\s+/g, "").toUpperCase();
            const response = await fetch("https://api.postcodes.io/postcodes/" + encodeURIComponent(compact));
            if (!response.ok) throw new Error("That full UK postcode could not be found.");
            const data = await response.json();
            const result = data.result;
            return {
                latitude: result.latitude,
                longitude: result.longitude,
                displayName: [result.postcode, result.admin_district, result.country].filter(Boolean).join(", ")
            };
        }

        // For an outward postcode, use the postcode area's approximate centre.
        async function lookupOutwardPostcode(outcode) {
            const compact = outcode.replace(/\s+/g, "").toUpperCase();
            const response = await fetch("https://api.postcodes.io/outcodes/" + encodeURIComponent(compact));
            if (!response.ok) throw new Error("That UK postcode area could not be found.");
            const data = await response.json();
            const result = data.result;
            const districts = Array.isArray(result.admin_district)
                ? result.admin_district.slice(0, 2).join(" / ") : result.admin_district;
            const countries = Array.isArray(result.country)
                ? result.country.join(" / ") : result.country;
            return {
                latitude: result.latitude,
                longitude: result.longitude,
                displayName: [result.outcode + " postcode area", districts, countries].filter(Boolean).join(", ")
            };
        }

        // API reference: Open-Meteo geocoding — https://open-meteo.com/en/docs/geocoding-api
        // Similar autocomplete technique (debounce, request IDs, DOM suggestions):
        // https://sinequa.github.io/sba-mint/next/atomic/examples/autocomplete
        // First Open-Meteo API suggests towns as the user types.
        async function searchLocations(query) {
            // ++ increments the search number before saving it.
            const requestId = ++locationSearchRequestId;
            const suggestions = document.getElementById("locationSuggestions");
            // count=8 asks for up to eight matching UK places.
            const url = "https://geocoding-api.open-meteo.com/v1/search?name=" +
                encodeURIComponent(query) + "&count=8&language=en&format=json&countryCode=GB";
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error("Location search failed.");
                const data = await response.json();
                // Ignore old responses if the user has typed something newer.
                if (requestId !== locationSearchRequestId) return;
                suggestions.replaceChildren();
                // Use an empty list if the API found nothing.
                const places = data.results || [];
                // Create one clickable dropdown button per town.
                places.forEach(function (place) {
                    // Create the button before adding it to the page.
                    const option = document.createElement("button");
                    option.type = "button";
                    option.className = "list-group-item list-group-item-action text-start";
                    // Show town and area, dropping missing or repeated names.
                    const name = [place.name, place.admin2, place.admin1].filter(Boolean);
                    option.textContent = [...new Set(name)].join(", ");
                    option.addEventListener("click", function () {
                        // Remember the selected town and its coordinates.
                        selectedLocation = place;
                        document.getElementById("siteLocation").value = option.textContent;
                        suggestions.hidden = true;
                        document.getElementById("conditionsStatus").textContent = "";
                    });
                    // Add this button to the visible dropdown.
                    suggestions.appendChild(option);
                });
                // Show suggestions only when matches exist.
                suggestions.hidden = places.length === 0;
            } catch (error) {
                if (requestId === locationSearchRequestId) {
                    suggestions.hidden = true;
                    suggestions.replaceChildren();
                }
            }
        }

        // JavaScript fetch and JSON examples: MDN Network requests
        // https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Network_requests
        // async/await reference: MDN async function
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function
        // async allows await to pause while an API responds.
        // Open-Meteo provides town searches and forecasts. Postcodes.io locates postcodes.
        async function checkInstallationConditions() {
            // Read the form values. trim removes spaces around a town or postcode.
            const location = document.getElementById("siteLocation").value.trim();
            const date = document.getElementById("installationDate").value;
            const time = document.getElementById("installationTime").value;
            const status = document.getElementById("conditionsStatus");
            const results = document.getElementById("conditionsResults");
            const button = document.getElementById("checkConditions");

            // Hide any previous forecast before starting another search.
            results.hidden = true;
            // ! means missing and || means OR. Stop if any input is empty.
            if (!location || !date || !time) {
                status.textContent = "Please enter a town or postcode, date and time.";
                return;
            }

            // Prevent repeat clicks while the forecast is loading.
            button.disabled = true;
            button.textContent = "Checking...";
            status.textContent = "Finding the location...";

            // try runs the requests. catch below handles problems.
            try {
                // Postcodes use Postcodes.io, towns keep the existing Open-Meteo lookup.
                let site;
                if (looksLikeFullPostcode(location)) {
                    site = await lookupFullPostcode(location);
                } else if (looksLikeOutwardPostcode(location)) {
                    site = await lookupOutwardPostcode(location);
                } else {
                    // Use a selected town, or search for the entered town as before.
                    site = selectedLocation;
                }
                if (!site) {
                    const locationUrl = "https://geocoding-api.open-meteo.com/v1/search?name=" +
                        encodeURIComponent(location) + "&count=1&language=en&format=json&countryCode=GB";
                    const locationResponse = await fetch(locationUrl);
                    if (!locationResponse.ok) throw new Error("The location service could not be reached.");
                    const locationData = await locationResponse.json();
                    if (!locationData.results || !locationData.results.length) {
                        throw new Error("No matching UK town was found.");
                    }
                    site = locationData.results[0];
                }
                // All location types use the same weather request.
                await retrieveInstallationForecast(site, date, time);
            // Show an error message instead of leaving a failed search unexplained.
            } catch (error) {
                status.textContent = error.message;
            // Always restore the button, whether the search worked or failed.
            } finally {
                button.disabled = false;
                button.textContent = "Check conditions";
            }
        }

        // API reference: Open-Meteo forecast parameters — https://open-meteo.com/en/docs
        // Postcode and town searches share one weather function.
        // site already contains the latitude, longitude and readable name.
        async function retrieveInstallationForecast(site, date, time) {
            const status = document.getElementById("conditionsStatus");
            const results = document.getElementById("conditionsResults");
            status.textContent = "Retrieving the forecast...";

            // Second API uses those coordinates to request hourly weather.
            // Asking for temperature, rain, conditions, wind, and gusts.
            const weatherUrl =
                "https://api.open-meteo.com/v1/forecast?latitude=" + site.latitude +
                "&longitude=" + site.longitude +
                "&hourly=temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m" +
                "&timezone=auto&wind_speed_unit=mph&precipitation_unit=mm" +
                "&start_date=" + date + "&end_date=" + date;
            // Send the weather request and wait for the result.
            const weatherResponse = await fetch(weatherUrl);
            if (!weatherResponse.ok) {
                throw new Error("The forecast could not be retrieved for that date.");
            }
            const weatherData = await weatherResponse.json();
            // Extract the hour and join date and time with a T.
            const requestedDateTime = date + "T" + time.substring(0, 2) + ":00";
            // indexOf finds the chosen hour in the list. -1 means not found.
            const index = weatherData.hourly.time.indexOf(requestedDateTime);
            if (index === -1) {
                throw new Error("No hourly forecast was available for that time.");
            }

            // Fill the empty HTML result fields with data for that hour.
            // toLocaleString formats the date in UK style.
            document.getElementById("conditionsLocation").textContent =
                site.displayName || (site.name + ", " + (site.admin1 || "UK"));
            document.getElementById("conditionsTime").textContent =
                new Date(requestedDateTime).toLocaleString("en-GB", {
                    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit"
                });
            document.getElementById("conditionsTemperature").textContent = weatherData.hourly.temperature_2m[index] + " °C";
            document.getElementById("conditionsWind").textContent = weatherData.hourly.wind_speed_10m[index] + " mph";
            document.getElementById("conditionsGusts").textContent = weatherData.hourly.wind_gusts_10m[index] + " mph";
            document.getElementById("conditionsRain").textContent = weatherData.hourly.precipitation[index] + " mm";
            // Weather codes are numbers. The function converts them to words.
            document.getElementById("conditionsWeather").textContent = describeWeatherCode(weatherData.hourly.weather_code[index]);
            status.textContent = "Forecast retrieved.";
            // Show the results once the forecast is ready.
            results.hidden = false;
        }

        // Match Open-Meteo weather numbers to readable descriptions.
        function describeWeatherCode(code) {
            const descriptions = {
                0: "Clear sky",
                1: "Mainly clear",
                2: "Partly cloudy",
                3: "Overcast",
                45: "Fog",
                48: "Rime fog",
                51: "Light drizzle",
                53: "Moderate drizzle",
                55: "Heavy drizzle",
                56: "Light freezing drizzle",
                57: "Heavy freezing drizzle",
                61: "Light rain",
                63: "Moderate rain",
                65: "Heavy rain",
                66: "Light freezing rain",
                67: "Heavy freezing rain",
                71: "Light snow",
                73: "Moderate snow",
                75: "Heavy snow",
                77: "Snow grains",
                80: "Light rain showers",
                81: "Moderate rain showers",
                82: "Heavy rain showers",
                85: "Light snow showers",
                86: "Heavy snow showers",
                95: "Thunderstorm",
                96: "Thunderstorm with light hail",
                99: "Thunderstorm with heavy hail"
            };

            // Use the description, or show the code if unknown.
            return descriptions[code] || "Weather code " + code;
        }
