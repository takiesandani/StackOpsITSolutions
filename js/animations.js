document.addEventListener('DOMContentLoaded', () => {
    const counters = document.querySelectorAll('.stat-item h3');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const counter = entry.target;
                const target = parseInt(counter.getAttribute('data-target'));
                let count = 0;
                const speed = 100; // Adjust for faster/slower count

                const updateCount = () => {
                    const increment = target / speed;
                    if (count < target) {
                        count += increment;
                        counter.innerText = Math.ceil(count);
                        setTimeout(updateCount, 1);
                    } else {
                        counter.innerText = target;
                    }
                };
                updateCount();
                observer.unobserve(counter); // Stop observing after it animates once
            }
        });
    }, {
        threshold: 0.5 // Trigger when 50% of the element is visible
    });

    counters.forEach(counter => {
        observer.observe(counter);
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const videoFrame = document.getElementById('bg-video');
    
    // Check if the video frame exists
    if (!videoFrame) return;

    // Use the YouTube Iframe Player API
    let player;
    function onYouTubeIframeAPIReady() {
        player = new YT.Player('bg-video', {
            events: {
                'onReady': onPlayerReady
            }
        });
    }

    function onPlayerReady(event) {
        const loopStart = 8; // start time in seconds
        const loopEnd = loopStart + 60; // end time is one minute after the start

        setInterval(() => {
            const currentTime = player.getCurrentTime();
            if (currentTime >= loopEnd) {
                player.seekTo(loopStart);
            }
        }, 500); // Check every half-second
    }

    // Load the YouTube Iframe API script
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
});