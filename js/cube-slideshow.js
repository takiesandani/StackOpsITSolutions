/**
 * Cube Slideshow Controller
 * Replaces CSS keyframe animation with JavaScript control
 * Ensures all buttons/links remain interactive at all times
 */

(function() {
    'use strict';

    const cube = document.querySelector('.cube');
    if (!cube) return;

    const faces = cube.querySelectorAll('.face');
    if (faces.length === 0) return;

    let currentIndex = 0;
    let autoPlayInterval = null;
    const slideDuration = 9000; // 7 seconds per slide
    let isPaused = false;

    /**
     * Show a specific face and hide others
     * Uses CSS transitions for smooth animations
     */
    function showFace(index) {
        faces.forEach((face, i) => {
            if (i === index) {
                // Show current face
                face.style.opacity = '1';
                face.style.transform = 'translateX(0)';
                face.style.zIndex = '10';
                face.style.pointerEvents = 'auto';
            } else {
                // Hide other faces
                face.style.opacity = '0';
                face.style.transform = 'translateX(100%)';
                face.style.zIndex = '1';
                // Keep pointer events enabled for buttons even when hidden
                face.style.pointerEvents = 'auto';
            }
        });

        // Ensure all interactive elements remain clickable
        const interactiveElements = cube.querySelectorAll('a, button, .glow-wrap, .link-content');
        interactiveElements.forEach(el => {
            el.style.pointerEvents = 'auto';
            el.style.zIndex = '15';
        });
    }

    /**
     * Go to next slide
     */
    function nextSlide() {
        currentIndex = (currentIndex + 1) % faces.length;
        showFace(currentIndex);
    }

    /**
     * Go to previous slide
     */
    function prevSlide() {
        currentIndex = (currentIndex - 1 + faces.length) % faces.length;
        showFace(currentIndex);
    }

    /**
     * Start auto-play
     */
    function startAutoPlay() {
        if (autoPlayInterval) clearInterval(autoPlayInterval);
        isPaused = false;
        autoPlayInterval = setInterval(() => {
            if (!isPaused) {
                nextSlide();
            }
        }, slideDuration);
    }

    /**
     * Pause auto-play
     */
    function pauseAutoPlay() {
        isPaused = true;
    }

    /**
     * Resume auto-play
     */
    function resumeAutoPlay() {
        isPaused = false;
    }

    /**
     * Go to specific slide
     */
    function goToSlide(index) {
        if (index >= 0 && index < faces.length) {
            currentIndex = index;
            showFace(currentIndex);
        }
    }

    // Initialize on page load
    function init() {
        // Set initial state - show first face
        showFace(0);
        
        // Start auto-play
        startAutoPlay();

        // Pause on hover over cube container
        cube.addEventListener('mouseenter', pauseAutoPlay);
        cube.addEventListener('mouseleave', resumeAutoPlay);

        // Pause on hover over individual faces
        faces.forEach(face => {
            face.addEventListener('mouseenter', pauseAutoPlay);
            face.addEventListener('mouseleave', resumeAutoPlay);
        });

        // Pause on interaction with buttons and links
        const interactiveElements = cube.querySelectorAll('a, button, .glow-wrap, .link-content, .warranty-buy-btn, .shop-now-btn');
        interactiveElements.forEach(element => {
            // Pause on hover
            element.addEventListener('mouseenter', pauseAutoPlay);
            element.addEventListener('mouseleave', resumeAutoPlay);
            
            // Pause on focus (for keyboard navigation)
            element.addEventListener('focus', pauseAutoPlay);
            element.addEventListener('blur', resumeAutoPlay);
            
            // Pause on click/touch
            element.addEventListener('mousedown', pauseAutoPlay);
            element.addEventListener('touchstart', pauseAutoPlay);
        });

        // Expose controls globally (optional - for external control)
        window.cubeSlideshow = {
            next: nextSlide,
            prev: prevSlide,
            goTo: goToSlide,
            pause: pauseAutoPlay,
            resume: resumeAutoPlay,
            current: () => currentIndex,
            total: () => faces.length
        };
    }

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();

