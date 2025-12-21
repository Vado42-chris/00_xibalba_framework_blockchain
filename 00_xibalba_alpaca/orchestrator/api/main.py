
# include temporary smoke routes for SetupWizard dev flow
from .router_smoke import router as smoke_router
app.include_router(smoke_router)

