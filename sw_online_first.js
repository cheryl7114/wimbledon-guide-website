const cacheName = 'online_pwa_example_version_1.0'

const filesToCache =
        ['manifest.json',
            'index.html',
            'offline_message.html',
            'css/style.css',
            'icons/icon_small_red.png',
            'icons/icon_medium_green.png',
            'icons/icon_large_blue.png']


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