from app.settings import Settings


def test_secret_values_strip_bom_and_transport_whitespace():
    settings = Settings(
        supabase_service_role_key="\ufeffservice-role-key\r\n",
        gateway_service_secret=" gateway-secret\n",
        database_url="\ufeffpostgresql://example.test/database ",
        supabase_url="\ufeffhttps://project.supabase.co\r\n",
    )

    assert settings.service_role_secret == "service-role-key"
    assert settings.gateway_service_secret_value == "gateway-secret"
    assert settings.database_url_secret == "postgresql://example.test/database"
    assert settings.supabase_url == "https://project.supabase.co"
