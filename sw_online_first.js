const cacheName = 'wimbledon-guide-website-cache'

const filesToCache = [
    'index.html',
    'offline_message.html',
    'hotels.html',
    'thingsToDo.html',
    'restaurants.html',
    'routePlanner.html',
    'footer.html',
    'header.html',
    'css/style.css',
    'script.js',
    'manifest.json',
    'placeTypes.json',
    'icons/icon_small_pink.png',
    'icons/icon_medium_green.png',
    'icons/icon_large_blue.png',
    'images/placeholder.png',
    'images/markers/default.png'
]



// Install the service worker and cache the files in the array filesToCache[] 
self.addEventListener('install', e =>
{
    e.waitUntil(caches.open(cacheName)
            .then(cache =>
            {
                cache.addAll(filesToCache)
                return true
            }))
})


// Delete old versions of the cache when a new version is first loaded 
self.addEventListener('activate', event =>
{
    event.waitUntil(caches.keys()
            .then(keys => Promise.all(keys.map(key =>
                {
                    if (!cacheName.includes(key))
                    {
                        return caches.delete(key)
                    }
                }))))
})


// Fetch online first, then offline cached, then offline error page 
self.addEventListener('fetch', function (e) {
    e.respondWith(
            fetch(e.request)
            .then(function (response)
            {
                if (response) // file found online
                {
                    return response;
                }
            })
            .catch(function (error)
            {
                return caches.match(e.request)
                        .then(function (response)
                        {
                            if (response === undefined) // file not found in cache
                            {
                                return caches.match('offline_message.html')
                            } 
                            else // file found in cache
                            {
                                return response
                            }
                        })
            })
            )
})