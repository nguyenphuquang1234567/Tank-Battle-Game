// TensorFlow.js AI for Tank Game
// Note: This will be loaded dynamically in the browser

class TensorFlowAI {
    constructor() {
        this.model = null;
        this.isModelLoaded = false;
        this.gameStateHistory = [];
        this.maxHistoryLength = 100;
        
        // Initialize TensorFlow
        this.initTensorFlow();
    }

    async initTensorFlow() {
        try {
            // Get TensorFlow from window (loaded from CDN)
            const tf = window.tf;
            if (!tf) {
                throw new Error('TensorFlow.js not loaded');
            }
            
            // Set TensorFlow backend
            await tf.setBackend('cpu');
            console.log('TensorFlow.js initialized with backend:', tf.getBackend());
            
            // Create neural network model
            this.createModel();
            
            // Load pre-trained model if exists
            await this.loadModel();
            
        } catch (error) {
            console.error('Error initializing TensorFlow:', error);
        }
    }

    createModel() {
        const tf = window.tf;
        
        // Create a neural network for tank AI
        this.model = tf.sequential({
            layers: [
                // Input layer - game state features
                tf.layers.dense({
                    inputShape: [12], // 12 features from game state
                    units: 64,
                    activation: 'relu'
                }),
                
                // Hidden layers
                tf.layers.dense({
                    units: 32,
                    activation: 'relu'
                }),
                
                tf.layers.dense({
                    units: 16,
                    activation: 'relu'
                }),
                
                // Output layer - 4 actions (up, down, left, right)
                tf.layers.dense({
                    units: 4,
                    activation: 'softmax'
                })
            ]
        });

        // Compile model
        this.model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy']
        });

        console.log('Neural network model created');
    }

    // Convert game state to tensor features
    extractFeatures(gameState) {
        const aiTank = gameState.aiTank;
        const playerTank = gameState.playerTank;
        const bullets = gameState.bullets;
        const powerUps = gameState.powerUps;
        
        // Calculate distances and angles
        const distanceToPlayer = this.getDistance(aiTank, playerTank);
        const angleToPlayer = Math.atan2(playerTank.y - aiTank.y, playerTank.x - aiTank.x);
        
        // Find nearest bullet
        const nearestBullet = this.findNearestBullet(aiTank, bullets);
        const distanceToBullet = nearestBullet ? this.getDistance(aiTank, nearestBullet) : 1000;
        const angleToBullet = nearestBullet ? Math.atan2(nearestBullet.y - aiTank.y, nearestBullet.x - aiTank.x) : 0;
        
        // Find nearest power-up
        const nearestPowerUp = this.findNearestPowerUp(aiTank, powerUps);
        const distanceToPowerUp = nearestPowerUp ? this.getDistance(aiTank, nearestPowerUp) : 1000;
        const angleToPowerUp = nearestPowerUp ? Math.atan2(nearestPowerUp.y - aiTank.y, nearestPowerUp.x - aiTank.x) : 0;
        
        // Normalize features
        const features = [
            // Tank positions and health
            aiTank.x / 1000, // Normalized x position
            aiTank.y / 1000, // Normalized y position
            aiTank.health / aiTank.maxHealth, // Health percentage
            playerTank.x / 1000,
            playerTank.y / 1000,
            playerTank.health / playerTank.maxHealth,
            
            // Distances
            Math.min(distanceToPlayer / 500, 1), // Distance to player
            Math.min(distanceToBullet / 200, 1), // Distance to nearest bullet
            Math.min(distanceToPowerUp / 300, 1), // Distance to nearest power-up
            
            // Angles (normalized to -1 to 1)
            Math.sin(angleToPlayer),
            Math.cos(angleToPlayer),
            Math.sin(angleToBullet),
            Math.cos(angleToBullet)
        ];
        
        return features;
    }

    // Get AI decision using neural network
    async getDecision(gameState) {
        if (!this.model || !this.isModelLoaded) {
            // Fallback to rule-based AI if model not ready
            return this.getFallbackDecision(gameState);
        }

        try {
            const tf = window.tf;
            
            // Extract features from game state
            const features = this.extractFeatures(gameState);
            
            // Convert to tensor
            const inputTensor = tf.tensor2d([features]);
            
            // Get prediction
            const prediction = this.model.predict(inputTensor);
            const actionProbs = await prediction.array();
            
            // Clean up tensors
            inputTensor.dispose();
            prediction.dispose();
            
            // Convert probabilities to actions
            const actions = actionProbs[0];
            const decision = this.probabilitiesToAction(actions);
            
            return decision;
            
        } catch (error) {
            console.error('Error getting AI decision:', error);
            return this.getFallbackDecision(gameState);
        }
    }

    // Convert neural network output to tank actions
    probabilitiesToAction(probabilities) {
        const [upProb, downProb, leftProb, rightProb] = probabilities;
        
        // Threshold-based decision
        const threshold = 0.3;
        
        return {
            up: upProb > threshold,
            down: downProb > threshold,
            left: leftProb > threshold,
            right: rightProb > threshold,
            shoot: this.shouldShoot(probabilities)
        };
    }

    // Determine if AI should shoot
    shouldShoot(probabilities) {
        // Shoot if player is in front and close
        const [upProb, downProb, leftProb, rightProb] = probabilities;
        const maxProb = Math.max(upProb, downProb, leftProb, rightProb);
        
        // Shoot if confidence is high and player is nearby
        return maxProb > 0.5;
    }

    // Fallback rule-based AI
    getFallbackDecision(gameState) {
        const aiTank = gameState.aiTank;
        const playerTank = gameState.playerTank;
        const bullets = gameState.bullets;
        const powerUps = gameState.powerUps;
        
        const distance = this.getDistance(aiTank, playerTank);
        const angle = Math.atan2(playerTank.y - aiTank.y, playerTank.x - aiTank.x);
        
        // Simple rule-based behavior
        const decision = {
            up: false,
            down: false,
            left: false,
            right: false,
            shoot: distance < 200
        };
        
        // Move towards player if far, away if close
        if (distance > 200) {
            // Move towards player
            if (Math.abs(Math.sin(angle)) > 0.3) {
                decision.up = Math.sin(angle) < 0;
                decision.down = Math.sin(angle) > 0;
            }
            if (Math.abs(Math.cos(angle)) > 0.3) {
                decision.left = Math.cos(angle) < 0;
                decision.right = Math.cos(angle) > 0;
            }
        } else if (distance < 100) {
            // Move away from player
            if (Math.abs(Math.sin(angle)) > 0.3) {
                decision.up = Math.sin(angle) > 0;
                decision.down = Math.sin(angle) < 0;
            }
            if (Math.abs(Math.cos(angle)) > 0.3) {
                decision.left = Math.cos(angle) > 0;
                decision.right = Math.cos(angle) < 0;
            }
        }
        
        return decision;
    }

    // Helper functions
    getDistance(obj1, obj2) {
        const dx = obj1.x - obj2.x;
        const dy = obj1.y - obj2.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    findNearestBullet(tank, bullets) {
        let nearest = null;
        let minDistance = Infinity;
        
        bullets.forEach(bullet => {
            if (bullet.color !== tank.color) {
                const distance = this.getDistance(tank, bullet);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearest = bullet;
                }
            }
        });
        
        return nearest;
    }

    findNearestPowerUp(tank, powerUps) {
        let nearest = null;
        let minDistance = Infinity;
        
        powerUps.forEach(powerUp => {
            const distance = this.getDistance(tank, powerUp);
            if (distance < minDistance) {
                minDistance = distance;
                nearest = powerUp;
            }
        });
        
        return nearest;
    }

    // Save model
    async saveModel() {
        try {
            const tf = window.tf;
            await this.model.save('localstorage://tank-ai-model');
            console.log('Model saved successfully');
        } catch (error) {
            console.error('Error saving model:', error);
        }
    }

    // Load model
    async loadModel() {
        try {
            const tf = window.tf;
            this.model = await tf.loadLayersModel('localstorage://tank-ai-model');
            this.isModelLoaded = true;
            console.log('Model loaded successfully');
        } catch (error) {
            console.log('No saved model found, using new model');
            this.isModelLoaded = true;
        }
    }

    // Train model with game data
    async trainModel(gameData) {
        if (!this.model) return;
        
        try {
            const tf = window.tf;
            const features = gameData.map(data => data.features);
            const actions = gameData.map(data => data.action);
            
            const xs = tf.tensor2d(features);
            const ys = tf.tensor2d(actions);
            
            await this.model.fit(xs, ys, {
                epochs: 10,
                batchSize: 32,
                validationSplit: 0.2
            });
            
            // Clean up
            xs.dispose();
            ys.dispose();
            
            console.log('Model trained successfully');
            
        } catch (error) {
            console.error('Error training model:', error);
        }
    }
}

// Export for use in main game
if (typeof window !== 'undefined') {
    window.TensorFlowAI = TensorFlowAI;
} 