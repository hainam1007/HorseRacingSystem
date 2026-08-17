import { useCallback, useEffect, useState } from "react";
import { adminApi } from "../api/adminApi";
import {
  adaptAdminUserDetail,
  adaptAdminRaceResultDetail,
  adaptAdminRaceResults,
  adaptAdminUsers,
  adaptRaceRegistrationDetail,
  adaptRaceRegistrations,
} from "./adminApiAdapters";

export function useAdminModuleApi(moduleName) {
  const [liveData, setLiveData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const supportsLiveData = ["users", "registrations", "results"].includes(moduleName);

  const load = useCallback(async () => {
    if (!supportsLiveData) {
      setLiveData(null);
      setError("");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      if (moduleName === "users") {
        const data = await adminApi.listUsers({ page: 1, limit: 100 });
        setLiveData(adaptAdminUsers(data));
      }

      if (moduleName === "registrations") {
        const data = await adminApi.listRegistrations({ page: 1, limit: 100 });
        setLiveData(adaptRaceRegistrations(data));
      }

      if (moduleName === "results") {
        setLiveData(adaptAdminRaceResults(await adminApi.listRaceResults()));
      }
    } catch (apiError) {
      setError(apiError.message || (moduleName === "results" ? "Unable to load authoritative race results." : "Unable to load live admin data."));
      setLiveData(null);
    } finally {
      setIsLoading(false);
    }
  }, [moduleName, supportsLiveData]);

  useEffect(() => {
    load();
  }, [load]);

  const applyRowAction = useCallback(async ({ actionLabel, id, note, status }) => {
    if (!supportsLiveData) return false;

    if (moduleName === "users") {
      if (actionLabel === "Activate") {
        await adminApi.updateUserStatus(id, "active");
        await load();
        return true;
      }

      if (actionLabel === "Suspend") {
        await adminApi.updateUserStatus(id, "blocked");
        await load();
        return true;
      }
    }

    if (moduleName === "results") {
      if (actionLabel === "Request Correction") {
        await adminApi.requestRaceResultCorrection(id, note);
        await load();
        return true;
      }
      if (actionLabel === "Mark Correction Resolved") {
        await adminApi.resolveRaceResultCorrection(id);
        await load();
        return true;
      }
    }

    return false;
  }, [load, moduleName, supportsLiveData]);

  const getRowDetail = useCallback(async (id) => {
    if (moduleName === "users") {
      return adaptAdminUserDetail(await adminApi.getUser(id));
    }

    if (moduleName === "registrations") {
      return adaptRaceRegistrationDetail(await adminApi.getRegistration(id));
    }

    if (moduleName === "results") {
      const [results, readiness, participants, reports, violations, awards] = await Promise.all([
        adminApi.listRaceResults({ race_id: id }),
        adminApi.getRaceResultReadiness(id).catch(() => null),
        adminApi.getRaceResultParticipants(id).catch(() => null),
        adminApi.listRefereeReports({ race_id: id }).catch(() => null),
        adminApi.listViolations({ race_id: id }).catch(() => null),
        adminApi.listRacePrizeAwards(id).catch(() => null),
      ]);

      return adaptAdminRaceResultDetail({
        results,
        readiness,
        participants,
        reports,
        violations,
        awards,
      });
    }

    return null;
  }, [moduleName]);

  const assignRole = useCallback(async (id, roleName) => {
    await adminApi.assignUserRole(id, roleName);
    await load();
    return getRowDetail(id);
  }, [getRowDetail, load]);

  const removeRole = useCallback(async (id, roleName) => {
    await adminApi.removeUserRole(id, roleName);
    await load();
    return getRowDetail(id);
  }, [getRowDetail, load]);

  return {
    liveData,
    isLoading,
    error,
    reload: load,
    applyRowAction,
    getRowDetail,
    assignRole,
    removeRole,
    supportsLiveData,
  };
}
