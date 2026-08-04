import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { CertVaultCertificatesResponse } from "@shared";

import { CertificateSummary } from "@/components/CertificateSummary";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { useConfig } from "@/context/ConfigContext";
import { certificateApi } from "@/services/api";

export default function Certificates() {
  const { t } = useTranslation();
  const config = useConfig();
  const [data, setData] = useState<CertVaultCertificatesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);

    try {
      setData((await certificateApi.getAll(refresh)).data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (config?.certVaultConfigured) void load(false);
  }, [config?.certVaultConfigured, load]);

  if (config && !config.certVaultConfigured) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>{t("certificates.title")}</CardTitle>
            <CardDescription>{t("certificates.notConfigured")}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t("certificates.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("certificates.count", { count: data?.certificates.length ?? 0 })}
          </p>
        </div>
        <div className="flex gap-2">
          {data?.consoleUrl && (
            <Button variant="outline" asChild>
              <a href={data.consoleUrl} target="_blank" rel="noreferrer">
                {t("certificates.openCertVault")}
              </a>
            </Button>
          )}
          <Button onClick={() => void load(true)} disabled={loading}>
            {loading ? t("certificates.loading") : t("certificates.refresh")}
          </Button>
        </div>
      </div>

      {error && (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {!error && !loading && data?.certificates.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {t("certificates.empty")}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {data?.certificates.map((certificate) => (
          <CertificateSummary key={certificate.name} certificate={certificate} showServices />
        ))}
      </div>
    </div>
  );
}
