use crate::errors::EngineError;

// Generic Game API
pub trait Game<GraphicsContext> {
    fn setup(&mut self, context: &mut super::EngineContext) -> Result<(), EngineError>;
    fn update(&mut self, context: &mut super::EngineContext) -> Result<(), EngineError>;
    fn resize(&mut self, context: &mut super::EngineContext);
    fn resume(&mut self, context: &mut super::EngineContext);
}
