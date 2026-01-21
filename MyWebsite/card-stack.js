/**
 * Card Stack Interactive Component
 * Based on Unity RecordController/RecordSpawner mechanics
 */

// Utility functions
function lerp(a, b, t) {
    return a + (b - a) * t;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function remap(value, inMin, inMax, outMin, outMax) {
    return outMin + (outMax - outMin) * ((value - inMin) / (inMax - inMin));
}

function distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/**
 * Individual Card class
 */
class Card {
    constructor(element, index, stack) {
        this.element = element;
        this.index = index;
        this.stack = stack;

        // Current state
        this.x = 0;
        this.y = 0;
        this.rotation = 0;
        this.scale = 1;
        this.scaleX = 1;
        this.scaleY = 1;
        this.opacity = 1;
        this.zIndex = index;

        // Target state (for lerping)
        this.targetX = 0;
        this.targetY = 0;

        // Drag state
        this.isDragging = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;

        // Click detection
        this.pointerDownPos = { x: 0, y: 0 };
        this.hasDragged = false;

        // Velocity tracking for rotation
        this.lastX = 0;
        this.lastY = 0;
        this.velocityX = 0;
        this.velocityY = 0;

        // Configuration (non-scaling values)
        this.config = {
            moveSmoothing: 0.35,
            rotationSmoothing: 0.1,
            onDragRotationSpeed: 2.1,
            onDragMaxRot: 25,
            onDragRotSmoothing: 0.15,
            onDragScaleSize: 0.85,
        };

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.element.addEventListener('pointerdown', this.onPointerDown.bind(this));
        this.element.addEventListener('pointermove', this.onPointerMove.bind(this));
        this.element.addEventListener('pointerup', this.onPointerUp.bind(this));
        this.element.addEventListener('pointercancel', this.onPointerUp.bind(this));
        this.element.addEventListener('pointerleave', this.onPointerLeave.bind(this));

        // Hover events for grid mode
        this.element.addEventListener('mouseenter', this.onMouseEnter.bind(this));
        this.element.addEventListener('mouseleave', this.onMouseLeave.bind(this));
    }

    onMouseEnter() {
        if (this.stack.viewMode === 'grid') {
            this.stack.gridHoveredElement = this.element; // Track this specific element
            this.stack.gridTargetSpeed = 0; // Stop sliding
            this.stack.showGridHoverInfo(this); // Show this card's info
        }
    }

    onMouseLeave() {
        if (this.stack.viewMode === 'grid') {
            this.stack.gridHoveredElement = null;
            this.stack.gridTargetSpeed = 21; // Resume sliding
            this.stack.hideGridHoverInfo(); // Hide info
        }
    }

    onPointerDown(e) {
        // Disable interaction in expanded mode
        if (this.stack.viewMode === 'expanded') {
            return;
        }

        e.preventDefault();
        this.element.setPointerCapture(e.pointerId);

        // Track for click detection
        this.pointerDownPos = { x: e.clientX, y: e.clientY };
        this.hasDragged = false;

        // In grid mode, we only want click, not drag
        if (this.stack.viewMode === 'grid') {
            return;
        }

        this.isDragging = true;
        this.element.classList.add('dragging');

        // Calculate offset from card center
        const rect = this.stack.container.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        this.dragOffsetX = e.clientX - centerX - this.x;
        this.dragOffsetY = e.clientY - centerY - this.y;

        this.lastX = e.clientX;
        this.lastY = e.clientY;

        // Bring to front immediately
        this.stack.bringToFront(this);
    }

    onPointerMove(e) {
        // Check if we've moved enough to be considered a drag
        const dist = distance(this.pointerDownPos.x, this.pointerDownPos.y, e.clientX, e.clientY);
        if (dist > 10) {
            this.hasDragged = true;
            // Dismiss first-time tip on drag
            const tip = document.getElementById('dragTip');
            if (tip && tip.classList.contains('visible')) {
                tip.classList.remove('visible');
                localStorage.setItem('hasVisited', 'true');
            }
        }

        if (!this.isDragging) return;

        const rect = this.stack.container.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        // Calculate target position relative to center
        this.targetX = e.clientX - centerX - this.dragOffsetX;
        this.targetY = e.clientY - centerY - this.dragOffsetY;

        // Track velocity
        this.velocityX = e.clientX - this.lastX;
        this.velocityY = e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
    }

    onPointerUp(e) {
        // Check for click (not drag)
        if (!this.hasDragged && this.stack.viewMode !== 'expanded') {
            this.isDragging = false;
            this.element.classList.remove('dragging');
            this.stack.expandCard(this);
            this.element.releasePointerCapture(e.pointerId);
            return;
        }

        if (!this.isDragging) return;

        this.isDragging = false;
        this.element.classList.remove('dragging');
        this.element.releasePointerCapture(e.pointerId);

        // Reset target to center
        this.targetX = 0;
        this.targetY = 0;
    }

    onPointerLeave(e) {
        // Only handle if we're not capturing
        if (!this.isDragging) return;
    }

    update(deltaTime) {
        const dt = Math.min(deltaTime, 0.05); // Cap delta time

        if (this.isDragging) {
            this.updateDragging(dt);
        } else {
            this.updateIdle(dt);
        }

        this.applyTransform();
    }

    updateDragging(dt) {
        // Smooth position toward target
        this.x = lerp(this.x, this.targetX, this.config.moveSmoothing);
        this.y = lerp(this.y, this.targetY, this.config.moveSmoothing);

        // Calculate distance from center
        const dist = distance(0, 0, this.x, this.y);

        // Velocity-based rotation (tilt when dragging horizontally)
        const targetRotation = clamp(
            this.velocityX * this.config.onDragRotationSpeed,
            -this.config.onDragMaxRot,
            this.config.onDragMaxRot
        );
        this.rotation = lerp(this.rotation, targetRotation, this.config.onDragRotSmoothing);

        // Get scaled radius values from stack
        const scaleClampRadius = this.stack.getScaledRadius('scale');
        const clampedDist = clamp(dist, scaleClampRadius[0], scaleClampRadius[1]);
        const targetScale = remap(
            clampedDist,
            scaleClampRadius[0],
            scaleClampRadius[1],
            1,
            this.config.onDragScaleSize
        );
        this.scaleX = lerp(this.scaleX, targetScale, 0.3);
        this.scaleY = lerp(this.scaleY, targetScale, 0.3);

        // Update z-index based on distance
        this.updateZIndexFromDistance(dist);

        // Decay velocity
        this.velocityX *= 0.9;
        this.velocityY *= 0.9;
    }

    updateIdle(dt) {
        if (this.stack.viewMode === 'expanded') {
            // Expanded mode
            if (this === this.stack.expandedCard) {
                // Animate the expanded card toward the banner position, then fade
                const bannerY = -window.innerHeight / 2 + window.innerHeight * 0.075; // Center of 15vh banner

                this.x = lerp(this.x, 0, this.config.moveSmoothing);
                this.y = lerp(this.y, bannerY, this.config.moveSmoothing);
                this.rotation = lerp(this.rotation, 0, this.config.rotationSmoothing);
                this.scaleX = lerp(this.scaleX, 1, 0.15);
                this.scaleY = lerp(this.scaleY, 1, 0.15);
                // Fade out once near the banner
                this.opacity = lerp(this.opacity, 0, 0.1);
            } else {
                // Other cards - fade out
                this.opacity = lerp(this.opacity, 0, 0.15);
                this.scaleX = lerp(this.scaleX, 0.8, 0.15);
                this.scaleY = lerp(this.scaleY, 0.8, 0.15);
            }
        } else if (this.stack.viewMode === 'grid') {
            // Grid mode: move to grid position
            // Use stored offset for the card that was just expanded (return animation to clone position)
            const colOffset = (this.index === this.stack.expandedCardIndex)
                ? this.stack.expandedFromCloneOffset
                : 0;
            const gridPos = this.stack.getGridPosition(this.index, colOffset);
            this.x = lerp(this.x, gridPos.x, this.config.moveSmoothing);
            this.y = lerp(this.y, gridPos.y, this.config.moveSmoothing);

            // No rotation in grid mode
            this.rotation = lerp(this.rotation, 0, this.config.rotationSmoothing);

            // Determine target scale based on hover state (using adaptive scale)
            const baseScale = this.stack.getAdaptiveGridScale();
            let targetScale = baseScale;
            if (this.stack.gridHoveredElement) {
                if (this.stack.gridHoveredElement === this.element) {
                    targetScale = baseScale * 1.05; // 5% bigger
                    this.zIndex = 100; // Bring to front
                } else {
                    targetScale = baseScale * 0.95; // 5% smaller
                    this.zIndex = this.index;
                }
            } else {
                this.zIndex = this.index;
            }

            // Scale with hover interaction
            this.scaleX = lerp(this.scaleX, targetScale, 0.15);
            this.scaleY = lerp(this.scaleY, targetScale, 0.15);
            this.opacity = lerp(this.opacity, 1, 0.25);
        } else {
            // Stack mode: move back to center with y-offset based on stack position
            const yOffsetPerCard = -10; // pixels offset per card level
            const reverseIndex = this.stack.cards.length - 1 - this.zIndex;
            const totalOffset = (this.stack.cards.length - 1) * yOffsetPerCard;
            const cardYOffset = reverseIndex * yOffsetPerCard - totalOffset / 2;

            this.x = lerp(this.x, 0, this.config.moveSmoothing);
            this.y = lerp(this.y, cardYOffset, this.config.moveSmoothing);

            // Calculate idle rotation based on stack position
            const targetRotation = reverseIndex * (100 / (this.stack.cards.length + 1));
            this.rotation = lerp(this.rotation, targetRotation, this.config.rotationSmoothing);

            // Scale and opacity back to 1
            this.scaleX = lerp(this.scaleX, 1, 0.25);
            this.scaleY = lerp(this.scaleY, 1, 0.25);
            this.opacity = lerp(this.opacity, 1, 0.25);
        }

        // Decay velocity
        this.velocityX *= 0.9;
        this.velocityY *= 0.9;
    }

    updateZIndexFromDistance(dist) {
        const siblingRadius = this.stack.getScaledRadius('sibling');
        const clampedDist = clamp(dist, siblingRadius[0], siblingRadius[1]);

        // Map distance to index (farther = lower in stack)
        const maxIndex = this.stack.cards.length - 1;
        const newIndex = Math.round(
            remap(clampedDist, siblingRadius[0], siblingRadius[1], maxIndex, 0)
        );

        // Only update if changed significantly
        if (newIndex !== this.zIndex) {
            this.stack.updateCardOrder(this, newIndex);
        }
    }

    applyTransform() {
        // Round position to whole pixels to prevent sub-pixel flickering
        const x = Math.round(this.x);
        const y = Math.round(this.y);
        this.element.style.transform = `
            translate3d(${x}px, ${y}px, 0)
            rotate(${this.rotation}deg)
            scale(${this.scaleX}, ${this.scaleY})
        `;
        this.element.style.zIndex = this.zIndex;
        this.element.style.opacity = this.opacity;
    }

    setZIndex(index) {
        this.zIndex = index;
    }
}

/**
 * Card Stack Manager
 */
class CardStack {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            maxCards: options.maxCards || 8,
            spawnInterval: options.spawnInterval || 100,
            cardData: options.cardData || [],
            colors: options.colors || [
                '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
                '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'
            ],
            infoDisplay: options.infoDisplay || null,
            // Base values (at 800px viewport)
            baseCardWidth: 400,
            baseCardHeight: 400,
            baseScaleRadius: [100, 300],
            baseSiblingRadius: [150, 350],
        };

        this.cards = [];
        this.cardsSpawned = 0;
        this.lastTime = performance.now();

        // Scaling factor based on viewport
        this.scaleFactor = 1;

        // Track current top card for text display
        this.currentTopCardIndex = -1;
        this.isTextAnimating = false;

        // View mode: 'stack', 'grid', or 'expanded'
        this.viewMode = 'stack';
        this.expandedCard = null;
        this.previousViewMode = 'stack'; // Track previous mode for collapse

        // Scroll tracking for detail page
        this.detailScrollY = 0;

        // Grid infinite scroll
        this.gridClones = [];
        this.rowOffsets = [0, 0, 0];
        this.gridHoveredElement = null; // Track actual DOM element being hovered
        this.gridSlideSpeed = 21; // Current speed (will lerp toward target)
        this.gridTargetSpeed = 21; // Target speed (21 normal, 0 when hovering)
        this.expandedFromCloneOffset = 0; // Track which clone was clicked for return animation
        this.expandedCardIndex = -1; // Track which card was expanded (for return animation)

        this.updateSizes();
        this.setupResizeListener();
        this.spawnAllCards();
        this.startAnimationLoop();
    }

    updateSizes() {
        // Calculate scale factor based on viewport
        const viewportMin = Math.min(window.innerWidth, window.innerHeight);
        const baseViewport = 800; // Reference viewport size
        this.scaleFactor = clamp(viewportMin / baseViewport, 0.4, 1.5);

        // Update CSS variables for card size
        const cardWidth = Math.round(this.options.baseCardWidth * this.scaleFactor);
        const cardHeight = Math.round(this.options.baseCardHeight * this.scaleFactor);
        this.container.style.setProperty('--card-width', `${cardWidth}px`);
        this.container.style.setProperty('--card-height', `${cardHeight}px`);
    }

    getScaledRadius(type) {
        const base = type === 'scale'
            ? this.options.baseScaleRadius
            : this.options.baseSiblingRadius;

        return [
            base[0] * this.scaleFactor,
            base[1] * this.scaleFactor
        ];
    }

    getAdaptiveGridScale() {
        const cols = 3;
        const rows = Math.ceil(this.cards.length / cols);
        const gap = 16 * this.scaleFactor;

        // Target: grid should fill 75% of viewport height
        const targetHeight = window.innerHeight * 0.75;

        // Calculate what scale would make grid fit targetHeight
        // totalHeight = rows * (cardHeight * scale) + (rows - 1) * gap
        // Solve for scale: scale = (targetHeight - (rows-1)*gap) / (rows * cardHeight)
        const cardHeight = this.options.baseCardHeight * this.scaleFactor;
        const idealScale = (targetHeight - (rows - 1) * gap) / (rows * cardHeight);

        // Clamp between 0.4 and 0.9 to allow bigger cards on tall screens
        return clamp(idealScale, 0.4, 0.9);
    }

    getGridPosition(cardIndex, colOffset = 0) {
        const totalCards = this.cards.length;
        const cols = 3; // 3 columns for 3 rows
        const rows = Math.ceil(totalCards / cols);

        const row = Math.floor(cardIndex / cols);
        const col = cardIndex % cols + colOffset;

        // Calculate card dimensions with adaptive scaling
        const gridScale = this.getAdaptiveGridScale();
        const cardWidth = this.options.baseCardWidth * this.scaleFactor * gridScale;
        const cardHeight = this.options.baseCardHeight * this.scaleFactor * gridScale;
        // Scale gap: 1x at 0.5 scale, 1.5x at max scale
        const gapMultiplier = 1 + (gridScale - 0.5) / (0.9 - 0.5) * 0.5; // 1.0 to 1.5
        const gap = 16 * this.scaleFactor * gapMultiplier;

        // Calculate total grid size
        const totalWidth = cols * cardWidth + (cols - 1) * gap;
        const totalHeight = rows * cardHeight + (rows - 1) * gap;

        // Add row sliding offset (alternating directions)
        const rowOffset = this.rowOffsets[row % 3] || 0;

        // Calculate position (centered) with row offset
        let x = col * (cardWidth + gap) - totalWidth / 2 + cardWidth / 2 + rowOffset;
        const y = row * (cardHeight + gap) - totalHeight / 2 + cardHeight / 2;

        // Smooth wrap using modulo (no discrete jumps)
        const totalGridWidth = (cols * 5) * (cardWidth + gap); // Total width of all cards + clones

        // Use modulo for continuous smooth wrapping
        x = ((x % totalGridWidth) + totalGridWidth) % totalGridWidth;
        if (x > totalGridWidth / 2) x -= totalGridWidth;

        return { x, y, row };
    }

    toggleViewMode() {
        if (this.viewMode === 'stack') {
            this.viewMode = 'grid';
            this.rowOffsets = [0, 0, 0];
            // Reset expanded card tracking when entering grid fresh
            this.expandedFromCloneOffset = 0;
            this.expandedCardIndex = -1;
            this.createGridClones();
            this.hideGridHoverInfo(); // Hide info when entering grid
        } else {
            this.prepareStackFromGrid();
            this.destroyGridClones();
            this.viewMode = 'stack';
            // Show info for the top card when returning to stack
            const topCard = this.cards.find(c => c.zIndex === this.cards.length - 1);
            if (topCard) {
                this.updateInfoDisplay(topCard, true);
            }
            this.showInfoDisplay();
        }
        return this.viewMode;
    }

    showGridHoverInfo(card) {
        const { infoDisplay } = this.options;
        if (!infoDisplay || !card.data) return;

        const { titleEl, descriptionEl, innerEl } = infoDisplay;
        if (!titleEl || !descriptionEl || !innerEl) return;

        titleEl.textContent = card.data.title || '';
        descriptionEl.textContent = card.data.description || '';
        innerEl.classList.add('visible');
    }

    hideGridHoverInfo() {
        const { infoDisplay } = this.options;
        if (!infoDisplay) return;

        const { innerEl } = infoDisplay;
        if (!innerEl) return;

        innerEl.classList.remove('visible');
    }

    createGridClones() {
        this.gridClones = [];
        const cols = 3; // Match getGridPosition

        for (const card of this.cards) {
            // Create clones to left and right (2 sets each direction)
            for (const offset of [-2, -1, 1, 2]) {
                const clone = card.element.cloneNode(true);
                clone.classList.add('card-clone');
                this.container.appendChild(clone);

                // Make clone clickable - expands source card from clone's position
                clone.addEventListener('click', () => {
                    const rect = clone.getBoundingClientRect();
                    this.expandCard(card, {
                        x: rect.left,
                        y: rect.top,
                        width: rect.width,
                        height: rect.height,
                        colOffset: offset * cols
                    });
                });

                // Add hover events for clones - track the clone element itself
                clone.addEventListener('mouseenter', () => {
                    if (this.viewMode === 'grid') {
                        this.gridHoveredElement = clone; // Track this specific clone
                        this.gridTargetSpeed = 0;
                        this.showGridHoverInfo(card); // Show source card's info
                    }
                });
                clone.addEventListener('mouseleave', () => {
                    if (this.viewMode === 'grid') {
                        this.gridHoveredElement = null;
                        this.gridTargetSpeed = 21;
                        this.hideGridHoverInfo();
                    }
                });

                this.gridClones.push({
                    element: clone,
                    sourceCard: card,
                    colOffset: offset * cols
                });
            }
        }
    }

    destroyGridClones() {
        for (const clone of this.gridClones) {
            clone.element.remove();
        }
        this.gridClones = [];
    }

    updateGridSliding(dt) {
        // Smoothly lerp toward target speed (slows down on hover)
        this.gridSlideSpeed = lerp(this.gridSlideSpeed, this.gridTargetSpeed, 0.1);

        // Row 0: slide right, Row 1: slide left, Row 2: slide right
        // Let offsets grow continuously - wrapping happens in getGridPosition
        this.rowOffsets[0] += this.gridSlideSpeed * dt;
        this.rowOffsets[1] -= this.gridSlideSpeed * dt;
        this.rowOffsets[2] += this.gridSlideSpeed * dt;
    }

    updateGridClones() {
        const baseScale = this.getAdaptiveGridScale();

        for (const clone of this.gridClones) {
            const pos = this.getGridPosition(clone.sourceCard.index, clone.colOffset);

            // Determine scale based on hover - check if THIS clone is hovered
            let targetScale = baseScale;
            let zIndex = clone.sourceCard.index;
            if (this.gridHoveredElement) {
                if (this.gridHoveredElement === clone.element) {
                    targetScale = baseScale * 1.05; // This clone is hovered
                    zIndex = 100;
                } else {
                    targetScale = baseScale * 0.95; // Something else is hovered
                }
            }

            // Lerp scale for smooth transition
            clone.currentScale = clone.currentScale || baseScale;
            clone.currentScale = lerp(clone.currentScale, targetScale, 0.15);

            clone.element.style.transform = `
                translate3d(${Math.round(pos.x)}px, ${Math.round(pos.y)}px, 0)
                scale(${clone.currentScale})
            `;
            clone.element.style.opacity = '1';
            clone.element.style.zIndex = zIndex;
        }
    }

    prepareStackFromGrid() {
        // When returning to stack, adjust card positions to be near center
        // so they don't fly in from far away
        const gridScale = this.getAdaptiveGridScale();
        const cardWidth = this.options.baseCardWidth * this.scaleFactor * gridScale;
        const gapMultiplier = 1 + (gridScale - 0.5) / (0.9 - 0.5) * 0.5;
        const gap = 16 * this.scaleFactor * gapMultiplier;
        const cols = 3; // Match getGridPosition
        const gridWidth = cols * (cardWidth + gap);

        for (const card of this.cards) {
            // Get current visual position
            const pos = this.getGridPosition(card.index);

            // Wrap to nearest position to center
            let wrappedX = pos.x;
            while (wrappedX > gridWidth / 2) wrappedX -= gridWidth;
            while (wrappedX < -gridWidth / 2) wrappedX += gridWidth;

            // Set card's current position to this wrapped value
            card.x = wrappedX;
            card.y = pos.y;
        }
    }

    expandCard(card, fromPosition = null) {
        // Store which clone offset was clicked (0 for original card)
        this.expandedFromCloneOffset = fromPosition?.colOffset || 0;
        this.expandedCardIndex = card.index;

        // If clicking from a clone, start animation from that position
        if (fromPosition) {
            card.x = fromPosition.x - window.innerWidth / 2 + fromPosition.width / 2;
            card.y = fromPosition.y - window.innerHeight / 2 + fromPosition.height / 2;
        }

        this.previousViewMode = this.viewMode;
        this.viewMode = 'expanded';
        this.expandedCard = card;
        this.showDetailPage(card);

        // While in fullscreen, shift the grid row to absorb the clone offset
        // This way when closing, the card's normal position IS where the clone was
        if (fromPosition?.colOffset && this.previousViewMode === 'grid') {
            setTimeout(() => {
                const cols = 3;
                const row = Math.floor(card.index / cols);
                const gridScale = this.getAdaptiveGridScale();
                const cardWidth = this.options.baseCardWidth * this.scaleFactor * gridScale;
                const gapMultiplier = 1 + (gridScale - 0.5) / (0.9 - 0.5) * 0.5;
                const gap = 16 * this.scaleFactor * gapMultiplier;

                // Add the clone's column offset to the row's sliding offset
                // colOffset is in columns, convert to pixels
                const pixelOffset = fromPosition.colOffset * (cardWidth + gap);
                this.rowOffsets[row % 3] += pixelOffset;

                // Reset tracking - card will now use normal position (colOffset=0)
                // but the grid has shifted so it visually matches the clone position
                this.expandedFromCloneOffset = 0;
                this.expandedCardIndex = -1;
            }, 300);
        }
    }

    collapseCard() {
        // Reset the expanded card's z-index to top of normal stack
        if (this.expandedCard) {
            this.expandedCard.zIndex = this.cards.length - 1;
        }
        this.viewMode = this.previousViewMode;
        this.expandedCard = null;
        this.hideDetailPage();

        // After animation completes, reset hover state and resume sliding
        if (this.previousViewMode === 'grid') {
            setTimeout(() => {
                this.gridHoveredElement = null;
                this.gridTargetSpeed = 21;
            }, 500);
        } else {
            // Returning to stack mode - show info display
            this.showInfoDisplay();
        }
    }

    showDetailPage(card) {
        const detailPage = document.getElementById('detailPage');
        const detailContent = document.getElementById('detailContent');

        // Create white overlay to hide cards behind
        this.detailOverlay = document.createElement('div');
        this.detailOverlay.className = 'detail-overlay';
        document.body.appendChild(this.detailOverlay);

        // Create back button above everything
        this.backButton = document.createElement('button');
        this.backButton.className = 'detail-back-btn';
        this.backButton.textContent = '← Back';
        this.backButton.addEventListener('click', () => this.collapseCard());
        document.body.appendChild(this.backButton);

        if (detailPage && detailContent) {
            // Reset scroll to top
            detailPage.scrollTop = 0;
            this.detailScrollY = 0;

            // Build content with banner at top (scrolls with page)
            let bannerHTML = '';
            const video = card.element.querySelector('video');
            if (video) {
                bannerHTML = `<div class="detail-banner"><video src="${video.src}" autoplay muted loop playsinline preload="metadata"></video></div>`;
            } else {
                const color = card.data?.color || '#333';
                bannerHTML = `<div class="detail-banner" style="background: ${color};"></div>`;
            }

            detailContent.innerHTML = bannerHTML + this.generateDetailContent(card);
            detailPage.classList.add('visible');

            // Track scroll for banner movement
            this.scrollListener = () => {
                this.detailScrollY = detailPage.scrollTop;
            };
            detailPage.addEventListener('scroll', this.scrollListener);

            // Over-scroll detection (wheel for desktop)
            this.wheelListener = (e) => {
                if (detailPage.scrollTop <= 0 && e.deltaY < -50) {
                    this.collapseCard();
                }
            };
            detailPage.addEventListener('wheel', this.wheelListener);

            // Touch support for mobile pull-to-close
            this.touchStartY = 0;
            this.touchStartListener = (e) => {
                this.touchStartY = e.touches[0].clientY;
            };
            this.touchMoveListener = (e) => {
                if (detailPage.scrollTop <= 0) {
                    const touchY = e.touches[0].clientY;
                    if (touchY - this.touchStartY > 80) {
                        this.collapseCard();
                    }
                }
            };
            detailPage.addEventListener('touchstart', this.touchStartListener);
            detailPage.addEventListener('touchmove', this.touchMoveListener);
        }

        // Hide nav and card-info
        const topNav = document.querySelector('.top-nav');
        const cardInfo = document.querySelector('.card-info');
        if (topNav) topNav.style.opacity = '0';
        if (cardInfo) cardInfo.style.opacity = '0';
    }

    hideDetailPage() {
        const detailPage = document.getElementById('detailPage');
        const detailContent = document.getElementById('detailContent');

        // Clean up video elements to free memory
        if (detailContent) {
            const videos = detailContent.querySelectorAll('video');
            videos.forEach(video => {
                video.pause();
                video.removeAttribute('src');
                video.load(); // Triggers browser to release video resources
            });
            detailContent.innerHTML = '';
        }

        if (detailPage) {
            // Clean up scroll/touch listeners
            if (this.scrollListener) detailPage.removeEventListener('scroll', this.scrollListener);
            if (this.wheelListener) detailPage.removeEventListener('wheel', this.wheelListener);
            if (this.touchStartListener) detailPage.removeEventListener('touchstart', this.touchStartListener);
            if (this.touchMoveListener) detailPage.removeEventListener('touchmove', this.touchMoveListener);

            detailPage.classList.remove('visible');
        }

        // Remove white overlay
        if (this.detailOverlay) {
            this.detailOverlay.remove();
            this.detailOverlay = null;
        }

        // Remove back button
        if (this.backButton) {
            this.backButton.remove();
            this.backButton = null;
        }

        // Reset scroll tracking
        this.detailScrollY = 0;

        // Show nav and card-info
        const topNav = document.querySelector('.top-nav');
        const cardInfo = document.querySelector('.card-info');
        if (topNav) topNav.style.opacity = '1';
        if (cardInfo) cardInfo.style.opacity = '1';
    }

    generateDetailContent(card) {
        const title = card.data?.title || 'Project';
        const description = card.data?.description || 'Description';
        const fullDescription = card.data?.fullDescription || '';
        const color = card.data?.color || '#333';

        // If fullDescription exists, use it; otherwise use placeholder
        if (fullDescription) {
            // Split fullDescription into paragraphs
            const paragraphs = fullDescription.split('\n\n').filter(p => p.trim());
            const paragraphsHTML = paragraphs.map(p => {
                // Check for image marker [IMG:filename.png]
                const imgMatch = p.match(/^\[IMG:(.+)\]$/);
                if (imgMatch) {
                    return `<img src="${imgMatch[1]}" alt="" class="detail-content-image">`;
                }
                // Check for grid marker [GRID:img1,img2,img3,img4] - supports both images and videos
                const gridMatch = p.match(/^\[GRID:(.+)\]$/);
                if (gridMatch) {
                    const files = gridMatch[1].split(',').map(f => f.trim());
                    const mediaHTML = files.map(file => {
                        if (file.endsWith('.mp4')) {
                            return `<video src="${file}" autoplay muted loop playsinline></video>`;
                        }
                        return `<img src="${file}" alt="">`;
                    }).join('');
                    return `<div class="detail-image-grid">${mediaHTML}</div>`;
                }
                // Check for video marker [VIDEO:filename.mp4]
                const videoMatch = p.match(/^\[VIDEO:(.+)\]$/);
                if (videoMatch) {
                    return `<video src="${videoMatch[1]}" autoplay muted loop playsinline class="detail-content-video"></video>`;
                }
                return `<p class="detail-text">${p}</p>`;
            }).join('');

            return `
                <h1 class="detail-title">${title}</h1>
                <p class="detail-intro">${description}</p>
                ${paragraphsHTML}
            `;
        }

        return `
            <h1 class="detail-title">${title}</h1>
            <p class="detail-intro">${description}</p>
            <div class="detail-image" style="background: ${color};"></div>
            <p class="detail-text">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
                incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
                exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
            </p>
            <div class="detail-image" style="background: ${color}; opacity: 0.7;"></div>
            <p class="detail-text">
                Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu
                fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in
                culpa qui officia deserunt mollit anim id est laborum.
            </p>
            <div class="detail-image" style="background: ${color}; opacity: 0.5;"></div>
            <p class="detail-text">
                Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium
                doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore
                veritatis et quasi architecto beatae vitae dicta sunt explicabo.
            </p>
        `;
    }

    setupResizeListener() {
        let resizeTimeout;
        window.addEventListener('resize', () => {
            // Debounce resize updates
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.updateSizes();
            }, 100);
        });
    }

    spawnAllCards() {
        // Spawn cards with slight delay for visual effect
        for (let i = 0; i < this.options.maxCards; i++) {
            setTimeout(() => {
                this.spawnCard(i);

                // After last card spawns, fade in the text and show first-time tip
                if (i === this.options.maxCards - 1) {
                    setTimeout(() => {
                        this.showInfoDisplay();
                        this.showFirstTimeTip();
                    }, 300);
                }
            }, i * this.options.spawnInterval);
        }
    }

    spawnCard(index) {
        const cardData = this.options.cardData[index] || {};
        const color = cardData.color || this.options.colors[index % this.options.colors.length];

        const card = document.createElement('div');
        card.className = 'card';
        card.style.backgroundColor = color;

        // Add video background if specified
        if (cardData.video) {
            const video = document.createElement('video');
            video.className = 'card-video';
            video.src = cardData.video;
            video.autoplay = true;
            video.muted = true;
            video.loop = true;
            video.playsInline = true;
            video.setAttribute('playsinline', ''); // iOS support
            card.appendChild(video);
        }

        // Add content overlay
        const content = document.createElement('div');
        content.className = 'card-content';
        card.appendChild(content);

        this.container.appendChild(card);

        const cardInstance = new Card(card, index, this);
        cardInstance.data = cardData;
        this.cards.push(cardInstance);

        // Set initial z-index
        cardInstance.setZIndex(index);
        cardInstance.applyTransform();

        // Update info display for initial top card
        if (index === this.options.maxCards - 1) {
            this.updateInfoDisplay(cardInstance, true);
        }
    }

    bringToFront(card) {
        const maxIndex = this.cards.length - 1;

        // Move all cards with higher z-index down by 1
        for (const c of this.cards) {
            if (c !== card && c.zIndex > card.zIndex) {
                c.setZIndex(c.zIndex - 1);
            }
        }

        card.setZIndex(maxIndex);

        // Update info display
        this.updateInfoDisplay(card);
    }

    updateCardOrder(draggedCard, newIndex) {
        const oldIndex = draggedCard.zIndex;
        const maxIndex = this.cards.length - 1;

        if (newIndex === oldIndex) return;

        // Shift other cards to make room
        for (const card of this.cards) {
            if (card === draggedCard) continue;

            if (newIndex < oldIndex) {
                // Moving down in stack
                if (card.zIndex >= newIndex && card.zIndex < oldIndex) {
                    card.setZIndex(card.zIndex + 1);
                }
            } else {
                // Moving up in stack
                if (card.zIndex <= newIndex && card.zIndex > oldIndex) {
                    card.setZIndex(card.zIndex - 1);
                }
            }
        }

        draggedCard.setZIndex(newIndex);

        // Update info display if top card changed
        const newTopCard = this.cards.find(c => c.zIndex === maxIndex);
        if (newTopCard) {
            this.updateInfoDisplay(newTopCard);
        }
    }

    showInfoDisplay() {
        const { infoDisplay } = this.options;
        if (!infoDisplay) return;

        const { innerEl } = infoDisplay;
        if (!innerEl) return;

        innerEl.classList.add('visible');
    }

    showFirstTimeTip() {
        // Check if first visit
        if (localStorage.getItem('hasVisited')) return;

        const tip = document.getElementById('dragTip');
        if (!tip) return;

        // Show tip
        tip.classList.add('visible');

        // Auto-hide after 3 seconds
        setTimeout(() => {
            tip.classList.remove('visible');
            localStorage.setItem('hasVisited', 'true');
        }, 3000);
    }

    updateInfoDisplay(card, immediate = false) {
        const { infoDisplay } = this.options;
        if (!infoDisplay || !card.data) return;

        const { titleEl, descriptionEl, innerEl } = infoDisplay;
        if (!titleEl || !descriptionEl || !innerEl) return;

        // Skip if same card
        if (this.currentTopCardIndex === card.index && !immediate) return;

        this.currentTopCardIndex = card.index;

        if (immediate) {
            // Set immediately without animation (for initial load)
            titleEl.textContent = card.data.title || '';
            descriptionEl.textContent = card.data.description || '';
            return;
        }

        // Skip if already animating
        if (this.isTextAnimating) return;
        this.isTextAnimating = true;

        // Fade out
        innerEl.classList.remove('visible');

        // Wait for fade out, then update text and fade in
        setTimeout(() => {
            titleEl.textContent = card.data.title || '';
            descriptionEl.textContent = card.data.description || '';

            // Fade in
            innerEl.classList.add('visible');

            setTimeout(() => {
                this.isTextAnimating = false;
            }, 250);
        }, 250);
    }

    startAnimationLoop() {
        const animate = (currentTime) => {
            const deltaTime = (currentTime - this.lastTime) / 1000;
            this.lastTime = currentTime;

            // Update grid sliding when in grid mode
            if (this.viewMode === 'grid') {
                this.updateGridSliding(deltaTime);
                this.updateGridClones();
            }

            for (const card of this.cards) {
                card.update(deltaTime);
            }

            requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
    }
}
