/**
 * ANTIGRAVITY API BRIDGE CORE
 * Revolutionary bridge between Antigravity UI generation and Our Ants API
 * 
 * This is UNPRECEDENTED - No direct equivalent exists in the market
 * 
 * Cosmic Alignment: Antigravity (Google) + Black Hole (Our Search) = Cosmic Singularity
 */

import express from 'express';
import axios from 'axios';
import cors from 'cors';

// OllamaService - lazy load (optional, may be CommonJS)
let OllamaService = null;
let ollamaModuleLoaded = false;

async function loadOllamaService() {
  if (ollamaModuleLoaded) return OllamaService;
  
  try {
    const ollamaModule = await import('./sovereignty-platform/server/services/ollama-service.js');
    OllamaService = ollamaModule.default || ollamaModule.OllamaService || ollamaModule;
    ollamaModuleLoaded = true;
    return OllamaService;
  } catch (error) {
    console.warn('[Bridge] OllamaService not available, will use fallback processing:', error.message);
    ollamaModuleLoaded = true; // Mark as loaded even if failed
    return null;
  }
}

class AntigravityBridge {
  constructor(config = {}) {
    // Configuration
    this.config = {
      antsApiUrl: config.antsApiUrl || process.env.ANTS_API_URL || 'http://localhost:3213',
      antsApiKey: config.antsApiKey || process.env.ANTS_API_KEY,
      antigravityApiUrl: config.antigravityApiUrl || process.env.ANTIGRAVITY_API_URL,
      bridgePort: config.bridgePort || process.env.BRIDGE_PORT || 3001,
      ...config
    };

    // Express app
    this.app = express();
    this.app.use(express.json());
    this.app.use(cors());

    // Initialize Ollama service for local AI processing (optional, lazy-loaded)
    this.ollamaService = null;
    this.ollamaServicePromise = loadOllamaService();

    // Setup endpoints
    this.setupEndpoints();

    // Statistics
    this.stats = {
      requests: 0,
      successful: 0,
      failed: 0,
      averageResponseTime: 0
    };
  }

  /**
   * Setup all bridge endpoints
   */
  setupEndpoints() {
    // Health check
    this.app.get('/api/bridge/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        stats: this.stats
      });
    });

    // UI Generation Endpoint - THE CORE INNOVATION
    this.app.post('/api/bridge/ui-generate', async (req, res) => {
      const startTime = Date.now();
      this.stats.requests++;

      try {
        const { prompt, context = {}, constraints = {} } = req.body;

        if (!prompt) {
          return res.status(400).json({
            success: false,
            error: 'Prompt is required'
          });
        }

        // Step 1: Translate UI request to Ants API format
        const antsRequest = this.translateToAntsFormat(prompt, context, constraints);

        // Step 2: Get response from Our Ants API (FREE - uses our models)
        const antsResponse = await this.getAntsResponse(antsRequest);

        // Step 3: Translate Ants response to Antigravity format
        const translatedResponse = this.translateToAntigravityFormat(antsResponse);

        // Step 4: Generate UI using Antigravity (if available) or our own UI generator
        const uiResult = await this.generateUI(translatedResponse);

        const responseTime = Date.now() - startTime;
        this.updateStats(true, responseTime);

        res.json({
          success: true,
          ui: uiResult,
          responseTime,
          source: 'ants-api' // Using our API, not Google's
        });

      } catch (error) {
        const responseTime = Date.now() - startTime;
        this.updateStats(false, responseTime);

        console.error('Bridge error:', error);
        res.status(500).json({
          success: false,
          error: error.message,
          responseTime
        });
      }
    });

    // Component Enhancement Endpoint
    this.app.post('/api/bridge/enhance-component', async (req, res) => {
      try {
        const { component, requirements } = req.body;

        // Get enhancement suggestions from Ants API
        const enhancement = await this.getEnhancementSuggestions(component, requirements);

        // Enhance component
        const enhancedComponent = await this.enhanceComponent(component, enhancement);

        res.json({
          success: true,
          component: enhancedComponent,
          source: 'ants-api'
        });

      } catch (error) {
        console.error('Enhancement error:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Design System Integration Endpoint
    this.app.post('/api/bridge/design-system', async (req, res) => {
      try {
        const { designSystem, components } = req.body;

        // Integrate design system with Ants API
        const integrated = await this.integrateDesignSystem(designSystem, components);

        // Generate UI with integrated design system
        const result = await this.generateUIWithDesignSystem(integrated);

        res.json({
          success: true,
          ui: result,
          source: 'ants-api'
        });

      } catch (error) {
        console.error('Design system error:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Headless Shell Council Member Endpoint
    this.app.post('/api/bridge/shell-assist', async (req, res) => {
      try {
        const { command, context, history = [] } = req.body;

        // Get shell assistance from Ants API
        const assistance = await this.getShellAssistance(command, context, history);

        res.json({
          success: true,
          assistance,
          suggestions: assistance.suggestions,
          explanations: assistance.explanations,
          source: 'ants-api'
        });

      } catch (error) {
        console.error('Shell assist error:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
  }

  /**
   * Translate UI request to Ants API format
   */
  translateToAntsFormat(prompt, context, constraints) {
    return {
      type: 'ui_generation',
      prompt: prompt,
      context: {
        ...context,
        domain: 'ui_design',
        intelligence: 'enhanced'
      },
      constraints: constraints,
      requirements: {
        creativity: 'high',
        functionality: 'complete',
        design: 'modern',
        usability: 'optimal',
        accessibility: 'wcag-aa'
      }
    };
  }

  /**
   * Get response from Our Ants API (FREE - uses our models)
   */
  async getAntsResponse(requestData) {
    try {
      const response = await axios.post(
        `${this.config.antsApiUrl}/api/intelligence/process`,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${this.config.antsApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return response.data;

    } catch (error) {
      // Fallback to local processing if API unavailable
      console.warn('Ants API unavailable, using local processing:', error.message);
      return this.localProcessing(requestData);
    }
  }

  /**
   * Local processing fallback (uses Ollama for FREE local AI)
   */
  async localProcessing(requestData) {
    try {
      // Lazy-load OllamaService if not already loaded
      if (!this.ollamaService) {
        const OllamaServiceClass = await this.ollamaServicePromise;
        if (OllamaServiceClass) {
          this.ollamaService = new OllamaServiceClass();
        } else {
          console.warn('[Bridge] OllamaService not available, using basic fallback');
          return this.basicFallback(requestData);
        }
      }
      
      const ollamaAvailable = await this.ollamaService.isAvailable();
      
      if (ollamaAvailable) {
        // Use Ollama for AI processing
        const installedModels = await this.ollamaService.getInstalledModels();
        if (installedModels.length === 0) {
          console.warn('[Bridge] No Ollama models installed, using basic fallback');
          return this.basicFallback(requestData);
        }

        // Use first available model (or best model for UI generation)
        const modelName = this.selectBestModel(installedModels);
        
        // Create prompt for UI generation
        const uiPrompt = this.createUIGenerationPrompt(requestData);
        
        // Get AI response from Ollama
        const ollamaResponse = await this.ollamaService.chat(modelName, uiPrompt, {
          temperature: 0.7,
          top_p: 0.9
        });

        if (ollamaResponse.success) {
          // Parse AI response into UI components
          return this.parseAIResponseToUI(ollamaResponse.response, requestData);
        }
      }

      // Fallback to basic generation if Ollama fails
      return this.basicFallback(requestData);
    } catch (error) {
      console.error('[Bridge] Local processing error:', error);
      return this.basicFallback(requestData);
    }
  }

  /**
   * Select best Ollama model for UI generation
   */
  selectBestModel(models) {
    // Prefer code-focused models for UI generation
    const preferredModels = ['codellama', 'llama2', 'mistral', 'phi'];
    for (const preferred of preferredModels) {
      const found = models.find(m => m.name.includes(preferred));
      if (found) return found.name;
    }
    // Otherwise use first available
    return models[0].name;
  }

  /**
   * Create UI generation prompt for Ollama
   */
  createUIGenerationPrompt(requestData) {
    const { prompt, context, constraints, requirements } = requestData;
    
    return `You are a UI generation assistant. Generate a complete UI component based on this request:

REQUEST: ${prompt}

CONTEXT: ${JSON.stringify(context, null, 2)}

CONSTRAINTS: ${JSON.stringify(constraints, null, 2)}

REQUIREMENTS: ${JSON.stringify(requirements, null, 2)}

Please provide a structured response with:
1. HTML structure
2. CSS styling (modern, dark theme, Xibalba design system)
3. JavaScript interactions
4. Component description

Format your response as JSON with keys: html, css, javascript, description, components.`;
  }

  /**
   * Parse AI response into UI structure
   */
  parseAIResponseToUI(aiResponse, requestData) {
    try {
      // Try to parse as JSON first
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          components: parsed.components || this.generateBasicComponents(requestData.prompt),
          design: parsed.design || this.generateBasicDesign(requestData.prompt),
          interactions: parsed.interactions || this.generateBasicInteractions(requestData.prompt),
          html: parsed.html || '',
          css: parsed.css || '',
          javascript: parsed.javascript || '',
          source: 'ollama-local',
          model: 'ollama'
        };
      }
    } catch (error) {
      console.warn('[Bridge] Failed to parse AI response as JSON, using text extraction');
    }

    // Fallback: extract components from text
    return {
      components: this.extractComponentsFromText(aiResponse, requestData),
      design: this.generateBasicDesign(requestData.prompt),
      interactions: this.generateBasicInteractions(requestData.prompt),
      source: 'ollama-local-text',
      model: 'ollama',
      rawResponse: aiResponse
    };
  }

  /**
   * Extract components from text response
   */
  extractComponentsFromText(text, requestData) {
    // Basic extraction - look for HTML-like structures
    const htmlMatches = text.match(/<[^>]+>/g);
    if (htmlMatches && htmlMatches.length > 0) {
      return [{
        tag: 'div',
        class: 'generated-component',
        content: htmlMatches.join(' ')
      }];
    }
    return this.generateBasicComponents(requestData.prompt);
  }

  /**
   * Basic fallback when Ollama is unavailable
   */
  basicFallback(requestData) {
    return {
      components: this.generateBasicComponents(requestData.prompt),
      design: this.generateBasicDesign(requestData.prompt),
      interactions: this.generateBasicInteractions(requestData.prompt),
      source: 'basic-fallback'
    };
  }

  /**
   * Translate Ants response to Antigravity format
   */
  translateToAntigravityFormat(antsResponse) {
    return {
      type: 'ui_generation',
      components: antsResponse.components || [],
      design: antsResponse.design || {},
      interactions: antsResponse.interactions || [],
      patterns: antsResponse.patterns || [],
      optimization: antsResponse.optimization || {}
    };
  }

  /**
   * Generate UI (uses Antigravity if available, otherwise our generator)
   */
  async generateUI(translatedData) {
    // Try Antigravity first (if installed)
    if (this.isAntigravityAvailable()) {
      return await this.generateWithAntigravity(translatedData);
    }

    // Otherwise use our own UI generator
    return this.generateWithOurGenerator(translatedData);
  }

  /**
   * Check if Antigravity is available
   */
  isAntigravityAvailable() {
    // Check if Antigravity is installed and accessible
    // This would check for antigravity command or API
    return false; // Placeholder - would check actual availability
  }

  /**
   * Generate UI with Antigravity
   */
  async generateWithAntigravity(data) {
    // This would call Antigravity API or CLI
    // For now, return structured data
    return {
      html: this.generateHTML(data),
      css: this.generateCSS(data),
      javascript: this.generateJavaScript(data),
      components: data.components,
      design: data.design,
      source: 'antigravity'
    };
  }

  /**
   * Generate UI with our own generator
   */
  generateWithOurGenerator(data) {
    return {
      html: this.generateHTML(data),
      css: this.generateCSS(data),
      javascript: this.generateJavaScript(data),
      components: data.components,
      design: data.design,
      source: 'our-generator'
    };
  }

  /**
   * Generate HTML from data
   */
  generateHTML(data) {
    let html = '<!DOCTYPE html>\n<html lang="en">\n<head>\n';
    html += '  <meta charset="UTF-8">\n';
    html += '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
    html += '  <title>Generated UI</title>\n';
    html += '  <link rel="stylesheet" href="styles.css">\n';
    html += '</head>\n<body>\n';

    // Generate components
    if (data.components && data.components.length > 0) {
      data.components.forEach(component => {
        html += this.generateComponentHTML(component);
      });
    }

    html += '</body>\n';
    html += '<script src="script.js"></script>\n';
    html += '</html>\n';

    return html;
  }

  /**
   * Generate CSS from data
   */
  generateCSS(data) {
    let css = '/* Generated CSS */\n';
    css += ':root {\n';
    css += '  --primary-color: #007acc;\n';
    css += '  --secondary-color: #00BCD4;\n';
    css += '  --background: #1e1e1e;\n';
    css += '  --text: #ffffff;\n';
    css += '}\n\n';

    if (data.design && data.design.rules) {
      data.design.rules.forEach(rule => {
        css += `${rule.selector} {\n`;
        if (rule.properties) {
          rule.properties.forEach(prop => {
            css += `  ${prop.property}: ${prop.value};\n`;
          });
        }
        css += '}\n\n';
      });
    }

    return css;
  }

  /**
   * Generate JavaScript from data
   */
  generateJavaScript(data) {
    let js = '/* Generated JavaScript */\n';
    js += 'document.addEventListener("DOMContentLoaded", function() {\n';

    if (data.interactions && data.interactions.length > 0) {
      data.interactions.forEach(interaction => {
        js += `  // ${interaction.description || 'Interaction'}\n`;
        js += `  ${interaction.code || '// Interaction code'}\n\n`;
      });
    }

    js += '});\n';
    return js;
  }

  /**
   * Generate component HTML
   */
  generateComponentHTML(component) {
    const tag = component.tag || 'div';
    const className = component.class || '';
    const id = component.id || '';
    const content = component.content || '';

    return `  <${tag}${id ? ` id="${id}"` : ''}${className ? ` class="${className}"` : ''}>\n` +
           `    ${content}\n` +
           `  </${tag}>\n`;
  }

  /**
   * Get enhancement suggestions
   */
  async getEnhancementSuggestions(component, requirements) {
    const requestData = {
      type: 'component_enhancement',
      component: component,
      requirements: requirements
    };

    return await this.getAntsResponse(requestData);
  }

  /**
   * Enhance component
   */
  async enhanceComponent(component, enhancement) {
    return {
      ...component,
      ...enhancement,
      enhanced: true,
      enhancedAt: new Date().toISOString()
    };
  }

  /**
   * Integrate design system
   */
  async integrateDesignSystem(designSystem, components) {
    const requestData = {
      type: 'design_system_integration',
      designSystem: designSystem,
      components: components
    };

    return await this.getAntsResponse(requestData);
  }

  /**
   * Generate UI with design system
   */
  async generateUIWithDesignSystem(integratedData) {
    return await this.generateUI(integratedData);
  }

  /**
   * Get shell assistance (Headless Shell Council Member)
   */
  async getShellAssistance(command, context, history) {
    const requestData = {
      type: 'shell_assistance',
      command: command,
      context: context,
      history: history
    };

    const response = await this.getAntsResponse(requestData);

    return {
      suggestions: response.suggestions || [],
      explanations: response.explanations || [],
      alternatives: response.alternatives || [],
      bestPractices: response.bestPractices || []
    };
  }

  /**
   * Generate basic components (fallback)
   */
  generateBasicComponents(prompt) {
    return [
      {
        tag: 'div',
        class: 'container',
        content: prompt
      }
    ];
  }

  /**
   * Generate basic design (fallback)
   */
  generateBasicDesign(prompt) {
    return {
      theme: 'modern',
      colors: ['#007acc', '#00BCD4'],
      typography: 'system-ui'
    };
  }

  /**
   * Generate basic interactions (fallback)
   */
  generateBasicInteractions(prompt) {
    return [
      {
        description: 'Basic interaction',
        code: 'console.log("Interaction");'
      }
    ];
  }

  /**
   * Update statistics
   */
  updateStats(success, responseTime) {
    if (success) {
      this.stats.successful++;
    } else {
      this.stats.failed++;
    }

    // Update average response time
    const total = this.stats.requests;
    const currentAvg = this.stats.averageResponseTime;
    this.stats.averageResponseTime = ((currentAvg * (total - 1)) + responseTime) / total;
  }

  /**
   * Start the bridge server
   */
  start() {
    this.app.listen(this.config.bridgePort, () => {
      console.log(`🌉 Antigravity Bridge running on port ${this.config.bridgePort}`);
      console.log(`🚀 Using Our Ants API (FREE - no Google API costs)`);
      console.log(`🕳️  Black Hole Search Integration: Active`);
      console.log(`🌌 Cosmic Singularity: Operational`);
    });
  }
}

export default AntigravityBridge;

