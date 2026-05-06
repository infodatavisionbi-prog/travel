export default function PricesPage() {
  return (
    <section className="card">
      <div className="page-header">
        <div>
          <h2 className="page-title">Precios vigentes</h2>
          <p className="page-subtitle">Panel preparado para listar y mantener precios actuales.</p>
        </div>
      </div>
      <div className="empty-state">
        <div className="empty-state-title">Sin precios cargados</div>
        <div className="empty-state-desc">Conectá esta sección a Supabase para administrar tarifas por producto, temporada o viaje.</div>
      </div>
    </section>
  )
}
