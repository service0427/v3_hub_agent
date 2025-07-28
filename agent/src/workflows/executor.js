const CoupangSearchWorkflow = require('./coupang-search');

class WorkflowExecutor {
  constructor(browserManager, logger) {
    this.browserManager = browserManager;
    this.logger = logger;
    this.workflows = {
      'coupang-search': new CoupangSearchWorkflow(logger),
    };
  }

  async execute(workflowType, params) {
    const workflow = this.workflows[workflowType];
    
    if (!workflow) {
      throw new Error(`Unknown workflow type: ${workflowType}`);
    }

    // Create a new page for the workflow
    const page = await this.browserManager.newPage();
    
    try {
      this.logger.info('Executing workflow', { 
        type: workflowType, 
        params 
      });
      
      const result = await workflow.execute(page, params);
      
      this.logger.info('Workflow completed', { 
        type: workflowType,
        success: true 
      });
      
      return result;
      
    } catch (error) {
      this.logger.error('Workflow execution failed', {
        type: workflowType,
        error: error.message,
        stack: error.stack
      });
      
      // Take screenshot on error
      try {
        const screenshotPath = `logs/error-${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        this.logger.info('Error screenshot saved', { path: screenshotPath });
      } catch (screenshotError) {
        this.logger.error('Failed to take error screenshot', { 
          error: screenshotError.message 
        });
      }
      
      throw error;
      
    } finally {
      // Always close the page
      try {
        await page.close();
      } catch (closeError) {
        this.logger.error('Failed to close page', { 
          error: closeError.message 
        });
      }
    }
  }
}

module.exports = WorkflowExecutor;